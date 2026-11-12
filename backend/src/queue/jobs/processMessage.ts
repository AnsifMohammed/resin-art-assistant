import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { processAiDecision } from "../../ai/pipeline.ts";
import type { AiDecision } from "../../ai/types.ts";
import { db } from "../../db/index.ts";
import {
  aiDecisions,
  auditLog,
  channels,
  conversations,
  customers,
  escalationReasonEnum,
  escalations,
  messages,
  products,
} from "../../db/schema.ts";
import { Sentry } from "../../instrument.ts";
import { isAutomationPaused, markMessageSent } from "../../lib/conversation.ts";
import { logger } from "../../lib/logger.ts";
import { emitConversationUpdated, emitEscalationNew, emitMessageNew } from "../../realtime/events.ts";
import { ensureCustomerAnswered } from "../../services/fallback.ts";
import { notifyEscalation } from "../../services/notify.ts";
import { sendMessage } from "../../services/send.ts";

export interface ProcessMessageParams {
  conversationId: string;
  businessId: string;
}

export interface ProcessMessageOptions {
  /**
   * When true (default), a thrown error is turned into a parse_error escalation
   * instead of being rethrown. The queue worker passes false on attempts that
   * pg-boss will still retry.
   */
  finalAttempt?: boolean;
}

type EscalationReason = (typeof escalationReasonEnum.enumValues)[number];
type MessageRow = typeof messages.$inferSelect;

const ESCALATION_REASONS = new Set<string>(escalationReasonEnum.enumValues);

/** Map a decision's escalate_reason onto the DB enum (stored as-is when valid). */
export function normalizeReason(r: string | null | undefined): EscalationReason {
  if (r && ESCALATION_REASONS.has(r)) return r as EscalationReason;
  return "intent_unknown";
}


/**
 * Split a conversation's messages (oldest first) into the unprocessed batch of
 * inbound customer messages and the history before it.
 *
 * The batch is every inbound customer message after the last "boundary": the
 * last outbound message (AI, owner or staff) or the last inbound message
 * already linked to an ai_decisions row.
 */
function isBroadcast(m: MessageRow): boolean {
  return (m.metadata as { kind?: string } | null)?.kind === "broadcast";
}

export function selectBatch(
  allMessages: MessageRow[],
  processedMessageIds: Set<string>,
): { batch: MessageRow[]; history: MessageRow[] } {
  let boundary = -1;
  allMessages.forEach((m, i) => {
    // A broadcast is not a reply, so it must not hide customer messages sent just before it.
    if ((m.direction === "outbound" && !isBroadcast(m)) || processedMessageIds.has(m.id)) boundary = i;
  });

  const after = allMessages.slice(boundary + 1);
  const batch = after.filter((m) => m.direction === "inbound" && m.senderType === "customer");
  const batchIds = new Set(batch.map((m) => m.id));
  const history = allMessages.filter((m) => !batchIds.has(m.id));
  return { batch, history };
}

interface EscalateParams {
  businessId: string;
  conversationId: string;
  reason: EscalationReason;
  actorType: "ai" | "system";
  customerName: string;
  lastMessage: string;
  decision?: AiDecision;
  /** Latest inbound message of the batch (ai_decisions.message_id). */
  latestInboundMessageId?: string;
  details?: Record<string, unknown>;
}

/**
 * Atomically move an ai_active conversation to escalated and record the
 * escalation (+ ai_decisions row and audit entry). Returns false (and changes
 * nothing) if the conversation is no longer ai_active, e.g. an owner replied
 * or it was paused while the LLM was running.
 */
async function escalateConversation(p: EscalateParams): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(conversations)
      .set({ state: "escalated" })
      .where(
        and(
          eq(conversations.id, p.conversationId),
          eq(conversations.businessId, p.businessId),
          eq(conversations.state, "ai_active"),
        ),
      )
      .returning({ id: conversations.id, tag: conversations.tag });

    if (!claimed) return null;

    // Partial unique index (one open escalation per conversation) makes this a no-op
    // if an open escalation already exists.
    let [escalationRow] = await tx
      .insert(escalations)
      .values({
        businessId: p.businessId,
        conversationId: p.conversationId,
        reason: p.reason,
        assignedToUserId: null,
        alertedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!escalationRow) {
      [escalationRow] = await tx
        .select()
        .from(escalations)
        .where(and(eq(escalations.conversationId, p.conversationId), isNull(escalations.resolvedAt)));
    }

    if (p.decision && p.latestInboundMessageId) {
      await tx.insert(aiDecisions).values({
        messageId: p.latestInboundMessageId,
        conversationId: p.conversationId,
        businessId: p.businessId,
        intent: p.decision.intent,
        replyDraft: p.decision.reply,
        factsUsed: p.decision.facts_used,
        missingFacts: p.decision.missing_facts,
        escalate: true,
        escalateReason: p.reason,
        suggestedTag: p.decision.suggested_tag,
        languageDetected: p.decision.language_detected,
        sent: false,
      });
    }

    await tx.insert(auditLog).values({
      businessId: p.businessId,
      actorType: p.actorType,
      action: "escalation_created",
      conversationId: p.conversationId,
      escalationId: escalationRow?.id,
      details: {
        reason: p.reason,
        fromState: "ai_active",
        toState: "escalated",
        ...(p.decision ? { decision: p.decision } : {}),
        ...p.details,
      },
    });

    return { escalationId: escalationRow?.id ?? null, tag: claimed.tag };
  });

  if (!result) {
    logger.info(
      { conversationId: p.conversationId, reason: p.reason },
      "Escalation aborted: conversation is no longer ai_active",
    );
    return false;
  }

  if (result.escalationId) {
    emitEscalationNew(p.businessId, {
      escalationId: result.escalationId,
      conversationId: p.conversationId,
      reason: p.reason,
      customerName: p.customerName,
    });
  }
  emitConversationUpdated(p.businessId, {
    conversationId: p.conversationId,
    state: "escalated",
    tag: result.tag,
  });

  // Notification failures must not undo or retry the escalation.
  try {
    await notifyEscalation({
      businessId: p.businessId,
      conversationId: p.conversationId,
      reason: p.reason,
      customerName: p.customerName,
      lastMessage: p.lastMessage,
    });
  } catch (err) {
    logger.error({ err, conversationId: p.conversationId }, "Failed to notify escalation");
  }

  return true;
}

/** Last-resort escalation after an unexpected failure. Never throws. */
export async function escalateAfterFailure(params: ProcessMessageParams, err: unknown): Promise<void> {
  const { conversationId, businessId } = params;
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    const [customer] = conv
      ? await db.select().from(customers).where(eq(customers.id, conv.customerId))
      : [];

    const escalated = await escalateConversation({
      businessId,
      conversationId,
      reason: "parse_error",
      actorType: "system",
      customerName: customer?.name || customer?.handleOrPhone || "Customer",
      lastMessage: "",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    logger.warn({ conversationId, escalated }, "Processing failed; escalated with parse_error");
  } catch (escalateErr) {
    logger.error({ err: escalateErr, conversationId }, "Failed to escalate after processing failure");
    Sentry.captureException(escalateErr, { extra: { conversationId, businessId } });
  }
}

export async function processMessageJob(
  params: ProcessMessageParams,
  options: ProcessMessageOptions = {},
): Promise<AiDecision | null> {
  const finalAttempt = options.finalAttempt ?? true;
  // Set the moment a reply is handed to the channel. If that send fails the
  // channel itself is down, so a fallback would fail too — that case belongs to
  // alerting, not here.
  const outcome: PipelineOutcome = { replyAttempted: false };
  try {
    const decision = await runPipeline(params, outcome);
    // runPipeline returns a decision only when a reply actually went out; every
    // other outcome (escalated, skipped, nothing to do) returns null. So null is
    // exactly the set of cases where the customer would otherwise hear nothing.
    if (!decision && !outcome.replyAttempted) await ensureCustomerAnswered(params);
    return decision;
  } catch (err) {
    logger.error({ err, conversationId: params.conversationId, finalAttempt }, "processMessageJob failed");
    Sentry.captureException(err, { extra: { ...params } });
    // A retry may still succeed, so only answer the customer once we are done trying.
    if (!finalAttempt) throw err;
    await escalateAfterFailure(params, err);
    if (!outcome.replyAttempted) await ensureCustomerAnswered(params);
    return null;
  }
}

/** Lets runPipeline report that it already put a reply on the wire. */
interface PipelineOutcome {
  replyAttempted: boolean;
}

async function runPipeline(params: ProcessMessageParams, outcome: PipelineOutcome): Promise<AiDecision | null> {
  const { conversationId, businessId } = params;

  // 1. Load conversation. If state !== "ai_active" -> stop and return.
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)));

  if (!conv || conv.state !== "ai_active") {
    logger.info({ conversationId, state: conv?.state }, "Skipping AI processing: conversation not ai_active");
    return null;
  }

  // 1a. Global pause: messages stay stored, no AI.
  if (await isAutomationPaused(businessId)) {
    logger.info({ conversationId }, "Skipping AI processing: automation paused");
    return null;
  }

  // 2. Load customer + channel
  const [customer] = await db.select().from(customers).where(eq(customers.id, conv.customerId));
  const [channel] = await db.select().from(channels).where(eq(channels.id, conv.channelId));
  const customerDisplayName = customer?.name || customer?.handleOrPhone || "Customer";

  // 3. Load messages and select the unprocessed batch (all inbound customer
  //    messages since the last AI decision or outbound message).
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const decided = await db
    .select({ messageId: aiDecisions.messageId })
    .from(aiDecisions)
    .where(eq(aiDecisions.conversationId, conversationId));

  const { batch, history } = selectBatch(allMessages, new Set(decided.map((d) => d.messageId)));
  const latestInbound = batch[batch.length - 1];
  const rawText = batch
    .map((m) => (m.content ?? "").trim())
    .filter(Boolean)
    .join("\n");

  if (!latestInbound || !rawText) {
    logger.info({ conversationId }, "No unprocessed inbound messages");
    return null;
  }

  // 3a. Messaging window closed -> escalate (no AI call).
  if (conv.windowClosesAt && new Date(conv.windowClosesAt) < new Date()) {
    logger.info({ conversationId }, "Messaging window closed, escalating");
    if (await isAutomationPaused(businessId)) return null;
    await escalateConversation({
      businessId,
      conversationId,
      reason: "window_closed",
      actorType: "system",
      customerName: customerDisplayName,
      lastMessage: rawText,
      latestInboundMessageId: latestInbound.id,
      details: { windowClosesAt: conv.windowClosesAt },
    });
    return null;
  }

  // 4. Call AI pipeline (rules are applied inside)
  // If the triggering message is a product button click, pass the slug so the AI
  // focuses its reply on that specific product rather than guessing from the text.
  const latestMeta = latestInbound.metadata as Record<string, unknown> | null;
  const focusedProductSlug =
    latestMeta?.kind === "product_enquiry" && typeof latestMeta.slug === "string"
      ? latestMeta.slug
      : undefined;

  logger.info({ conversationId, batchSize: batch.length, focusedProductSlug }, "Running AI pipeline on message batch");
  const decision = await processAiDecision({
    businessId,
    incomingText: rawText,
    history: history.map((m) => ({ senderType: m.senderType, content: m.content })),
    customerName: customer?.name ?? null,
    customerHandle: customer?.handleOrPhone ?? null,
    ...(focusedProductSlug ? { focusedProductSlug } : {}),
  });

  // Re-check the pause switch: it may have been flipped during the LLM call.
  if (await isAutomationPaused(businessId)) {
    logger.info({ conversationId }, "Automation paused during AI call; not sending or escalating");
    return null;
  }

  // 5. Escalate
  if (decision.escalate) {
    const reason = normalizeReason(decision.escalate_reason);
    const escalated = await escalateConversation({
      businessId,
      conversationId,
      reason,
      actorType: "ai",
      customerName: customerDisplayName,
      lastMessage: rawText,
      decision,
      latestInboundMessageId: latestInbound.id,
    });
    return escalated ? decision : null;
  }

  // 6. Fetch interactive products if AI decided to share catalogue
  let interactiveProducts: Array<{
    id: string;
    slug: string;
    name: string;
    price: string;
    imageUrl?: string | undefined;
    images?: string[] | undefined;
    leadTime: number;
    description?: string | undefined;
    customizable?: boolean | undefined;
    customOptions?: string[] | undefined;
  }> = [];

  if (decision.send_catalogue) {
    let matchedProducts: Array<typeof products.$inferSelect> = [];
    const slugs = Array.isArray(decision.catalogue_product_slugs)
      ? decision.catalogue_product_slugs.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];

    if (slugs.length > 0) {
      matchedProducts = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.businessId, businessId),
            eq(products.isActive, true),
            inArray(products.slug, slugs),
          ),
        );
    }

    if (matchedProducts.length === 0) {
      matchedProducts = await db
        .select()
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.isActive, true)))
        .orderBy(asc(products.sortOrder), asc(products.name))
        .limit(5);
    }

    interactiveProducts = matchedProducts.map((p) => {
      const sizes = Array.isArray(p.sizes) ? p.sizes : [];
      const prices = sizes
        .map((s: any) => (typeof s?.price === "number" ? s.price : null))
        .filter((price): price is number => price !== null);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const priceStr =
        prices.length === 0
          ? "Price on request"
          : prices.length > 1 && minPrice !== maxPrice
            ? `₹${minPrice.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")}`
            : `₹${minPrice.toLocaleString("en-IN")}`;

      const images = Array.isArray(p.images) ? p.images : [];
      const validImages = images.filter((img): img is string => typeof img === "string" && img.trim().length > 0);
      const firstImg = typeof validImages[0] === "string" ? validImages[0] : undefined;

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: priceStr,
        imageUrl: firstImg,
        images: validImages,
        leadTime: p.leadTimeDays,
        description: p.description ?? undefined,
        customizable: p.customizable,
        customOptions: p.customOptions ?? [],
      };
    });
  }

  // 6b. If this is a product enquiry, fetch additional gallery images (images.slice(1))
  let additionalMediaUrls: string[] = [];
  const enquirySlug =
    focusedProductSlug ||
    (latestMeta?.kind === "product_enquiry" && typeof latestMeta.slug === "string" ? latestMeta.slug : undefined);

  if (enquirySlug) {
    const [enquiredProd] = await db
      .select({ images: products.images })
      .from(products)
      .where(and(eq(products.businessId, businessId), eq(products.slug, enquirySlug)));

    if (enquiredProd && Array.isArray(enquiredProd.images) && enquiredProd.images.length > 1) {
      additionalMediaUrls = enquiredProd.images
        .slice(1)
        .filter((img): img is string => typeof img === "string" && img.trim().length > 0);
    }
  }

  // 7. Auto-reply. Atomically confirm the conversation is still ai_active
  //    (row lock held until commit) before recording and sending the reply.
  const committed = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        ...(decision.suggested_tag ? { tag: decision.suggested_tag } : {}),
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.businessId, businessId),
          eq(conversations.state, "ai_active"),
        ),
      )
      .returning({ tag: conversations.tag });

    if (!claimed) return null;

    const msgMetadata: Record<string, unknown> = interactiveProducts.length > 0
      ? {
          kind: "catalogue_share",
          productIds: interactiveProducts.map((p) => p.id),
          products: interactiveProducts,
        }
      : {};

    const [outboundMsg] = await tx
      .insert(messages)
      .values({
        conversationId,
        businessId,
        direction: "outbound",
        senderType: "ai",
        senderId: null,
        content: decision.reply,
        mediaUrls: additionalMediaUrls,
        metadata: msgMetadata,
        deliveryStatus: "queued",
      })
      .returning();

    const [decisionRow] = await tx
      .insert(aiDecisions)
      .values({
        messageId: latestInbound.id,
        conversationId,
        businessId,
        intent: decision.intent,
        replyDraft: decision.reply,
        factsUsed: decision.facts_used,
        missingFacts: decision.missing_facts,
        escalate: false,
        escalateReason: null,
        suggestedTag: decision.suggested_tag,
        languageDetected: decision.language_detected,
        // Flipped to true only after the send succeeds.
        sent: false,
      })
      .returning({ id: aiDecisions.id });

    return { outboundMsg, decisionId: decisionRow?.id, tag: claimed.tag };
  });

  if (!committed) {
    logger.info({ conversationId }, "Auto-reply aborted: conversation is no longer ai_active");
    return null;
  }

  let metaMessageId: string | null = null;
  try {
    // The reply goes out on the conversation's own channel; never guess.
    if (!channel) throw new Error(`Channel ${conv.channelId} not found for conversation`);
    if (!customer?.handleOrPhone) throw new Error("Customer recipient not found for conversation");
    outcome.replyAttempted = true;
    const result = await sendMessage({
      channelType: channel.type,
      recipient: customer.handleOrPhone,
      text: decision.reply,
      mediaUrls: additionalMediaUrls.length > 0 ? additionalMediaUrls : undefined,
      businessId,
      conversationId,
      ...(interactiveProducts.length > 0
        ? {
            interactive: {
              type: interactiveProducts.length === 1 ? "catalogue_card" : "catalogue_list",
              products: interactiveProducts,
            },
          }
        : {}),
    });
    metaMessageId = result?.metaMessageId ?? null;
  } catch (err) {
    // Never retry the job here (that would duplicate the reply). Mark failed and
    // hand the conversation to a human.
    logger.error({ err, conversationId }, "Failed to send auto-reply");
    Sentry.captureException(err, { extra: { conversationId, businessId } });
    if (committed.outboundMsg) {
      await db.update(messages).set({ deliveryStatus: "failed" }).where(eq(messages.id, committed.outboundMsg.id));
      emitMessageNew({ ...committed.outboundMsg, deliveryStatus: "failed" });
    }
    await db.insert(auditLog).values({
      businessId,
      actorType: "ai",
      action: "auto_reply_failed",
      conversationId,
      details: {
        intent: decision.intent,
        messageId: committed.outboundMsg?.id,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    await escalateAfterFailure(params, err);
    return null;
  }

  if (committed.outboundMsg) {
    await markMessageSent(db, committed.outboundMsg.id, metaMessageId);
    emitMessageNew({ ...committed.outboundMsg, deliveryStatus: "sent", ...(metaMessageId ? { metaMessageId } : {}) });
  }
  if (committed.decisionId) {
    await db.update(aiDecisions).set({ sent: true }).where(eq(aiDecisions.id, committed.decisionId));
  }

  await db.insert(auditLog).values({
    businessId,
    actorType: "ai",
    action: interactiveProducts.length > 0 ? "catalogue_shared" : "auto_reply_sent",
    conversationId,
    details: {
      intent: decision.intent,
      messageId: committed.outboundMsg?.id,
      batchSize: batch.length,
      replyPreview: decision.reply.slice(0, 100),
      ...(interactiveProducts.length > 0 ? { catalogueProductCount: interactiveProducts.length } : {}),
    },
  });
  emitConversationUpdated(businessId, { conversationId, state: "ai_active", tag: committed.tag });

  return decision;
}
