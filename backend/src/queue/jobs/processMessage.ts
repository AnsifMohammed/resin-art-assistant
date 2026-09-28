import { and, asc, eq, isNull } from "drizzle-orm";
import { processAiDecision } from "../../ai/pipeline.ts";
import type { AiDecision } from "../../ai/types.ts";
import { db } from "../../db/index.ts";
import {
  aiDecisions,
  auditLog,
  businesses,
  channels,
  conversations,
  customers,
  escalationReasonEnum,
  escalations,
  messages,
} from "../../db/schema.ts";
import { Sentry } from "../../instrument.ts";
import { logger } from "../../lib/logger.ts";
import { emitConversationUpdated, emitEscalationNew, emitMessageNew } from "../../realtime/events.ts";
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

/** Global "pause automation" switch written by POST /settings/pause. */
export async function isAutomationPaused(businessId: string): Promise<boolean> {
  const [biz] = await db
    .select({ settings: businesses.settings })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  const settings = (biz?.settings as Record<string, unknown> | null) ?? {};
  return Boolean(settings.automation_paused);
}

/**
 * Split a conversation's messages (oldest first) into the unprocessed batch of
 * inbound customer messages and the history before it.
 *
 * The batch is every inbound customer message after the last "boundary": the
 * last outbound message (AI, owner or staff) or the last inbound message
 * already linked to an ai_decisions row.
 */
export function selectBatch(
  allMessages: MessageRow[],
  processedMessageIds: Set<string>,
): { batch: MessageRow[]; history: MessageRow[] } {
  let boundary = -1;
  allMessages.forEach((m, i) => {
    if (m.direction === "outbound" || processedMessageIds.has(m.id)) boundary = i;
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
  try {
    return await runPipeline(params);
  } catch (err) {
    logger.error({ err, conversationId: params.conversationId, finalAttempt }, "processMessageJob failed");
    Sentry.captureException(err, { extra: { ...params } });
    if (!finalAttempt) throw err;
    await escalateAfterFailure(params, err);
    return null;
  }
}

async function runPipeline(params: ProcessMessageParams): Promise<AiDecision | null> {
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
  logger.info({ conversationId, batchSize: batch.length }, "Running AI pipeline on message batch");
  const decision = await processAiDecision({
    businessId,
    incomingText: rawText,
    history: history.map((m) => ({ senderType: m.senderType, content: m.content })),
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

  // 6. Auto-reply. Atomically confirm the conversation is still ai_active
  //    (row lock held until commit) before recording and sending the reply.
  const committed = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(conversations)
      .set(decision.suggested_tag ? { tag: decision.suggested_tag } : { state: "ai_active" })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.businessId, businessId),
          eq(conversations.state, "ai_active"),
        ),
      )
      .returning({ tag: conversations.tag });

    if (!claimed) return null;

    const [outboundMsg] = await tx
      .insert(messages)
      .values({
        conversationId,
        businessId,
        direction: "outbound",
        senderType: "ai",
        senderId: null,
        content: decision.reply,
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

  try {
    // The reply goes out on the conversation's own channel; never guess.
    if (!channel) throw new Error(`Channel ${conv.channelId} not found for conversation`);
    if (!customer?.handleOrPhone) throw new Error("Customer recipient not found for conversation");
    await sendMessage({
      channelType: channel.type,
      recipient: customer.handleOrPhone,
      text: decision.reply,
      businessId,
      conversationId,
    });
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
    await db.update(messages).set({ deliveryStatus: "sent" }).where(eq(messages.id, committed.outboundMsg.id));
    emitMessageNew({ ...committed.outboundMsg, deliveryStatus: "sent" });
  }
  if (committed.decisionId) {
    await db.update(aiDecisions).set({ sent: true }).where(eq(aiDecisions.id, committed.decisionId));
  }

  await db.insert(auditLog).values({
    businessId,
    actorType: "ai",
    action: "auto_reply_sent",
    conversationId,
    details: {
      intent: decision.intent,
      messageId: committed.outboundMsg?.id,
      batchSize: batch.length,
      replyPreview: decision.reply.slice(0, 100),
    },
  });
  emitConversationUpdated(businessId, { conversationId, state: "ai_active", tag: committed.tag });

  return decision;
}
