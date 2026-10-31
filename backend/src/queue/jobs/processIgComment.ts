import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { classifyComment, type IgCommentCategory } from "../../ai/commentClassifier.ts";
import { ALWAYS_ESCALATE_PHRASES } from "../../ai/rules.ts";

const LOWER_ESCALATE_PHRASES = ALWAYS_ESCALATE_PHRASES.map((p) => p.toLowerCase());
import { config } from "../../config.ts";
import { db } from "../../db/index.ts";
import {
  auditLog,
  businesses,
  channels,
  conversations,
  customers,
  igCommentRules,
  igComments,
  messages,
} from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { emitConversationUpdated, emitIgCommentUpdated, emitMessageNew } from "../../realtime/events.ts";
import { replyToComment, sendPrivateReply } from "../../services/meta/instagram.ts";
import { notifyIgCommentAttention } from "../../services/notify.ts";

export interface ProcessIgCommentParams {
  commentId: string;
  businessId: string;
}

const _kwRegexCache = new Map<string, RegExp>();

export function matchesKeyword(text: string, kw: string): boolean {
  const trimmed = kw.trim();
  if (!trimmed) return false;
  let regex = _kwRegexCache.get(trimmed);
  if (!regex) {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:[^\\p{L}\\p{N}_]|$)`, "iu");
    _kwRegexCache.set(trimmed, regex);
  }
  return regex.test(text);
}

export function renderReplyText(
  tpl: string,
  username: string | null | undefined,
  caption: string | null | undefined,
): string {
  const handle = username ? `@${username.replace(/^@/, "")}` : "";
  const postTitle = (caption ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 40);
  return tpl
    .replace(/\{customerHandle\}/g, handle)
    .replace(/\{postTitle\}/g, postTitle);
}

async function skipComment(
  commentId: string,
  businessId: string,
  reason: string,
  extra?: {
    category?: IgCommentCategory;
    matchedRuleId?: string | null;
    matchedBy?: "keyword" | "ai" | null;
  },
): Promise<void> {
  await db
    .update(igComments)
    .set({ action: "skipped", skipReason: reason, processedAt: new Date(), ...extra })
    .where(eq(igComments.id, commentId));
  emitIgCommentUpdated(businessId, { commentId, action: "skipped" });
}

export async function processIgCommentJob(params: ProcessIgCommentParams): Promise<void> {
  // 1. Load comment; if action !== 'pending' -> stop (idempotent).
  const [comment] = await db
    .select()
    .from(igComments)
    .where(and(eq(igComments.id, params.commentId), eq(igComments.businessId, params.businessId)));

  if (!comment || comment.action !== "pending") return;

  // Sub-comment replies inside a thread must not trigger auto-replies
  if (comment.parentCommentId) {
    await skipComment(comment.id, params.businessId, "sub_comment");
    return;
  }

  // 2. Settings check: settings.igComments.enabled === false -> skipped (paused).
  const [biz] = await db
    .select({ settings: businesses.settings })
    .from(businesses)
    .where(eq(businesses.id, params.businessId));

  const settings = (biz?.settings as Record<string, any>) || {};
  const igSettings = settings.igComments ?? {};
  const isEnabled = igSettings.enabled !== false;
  const aiClassificationOn = igSettings.aiClassification !== false;

  if (!isEnabled) {
    await skipComment(comment.id, params.businessId, "paused");
    return;
  }

  // 3. Commenter is our account -> skipped (own_comment).
  if (config.INSTAGRAM_ACCOUNT_ID && comment.commenterIgId === config.INSTAGRAM_ACCOUNT_ID) {
    await skipComment(comment.id, params.businessId, "own_comment");
    return;
  }

  // 4. Complaint first: ALWAYS_ESCALATE_PHRASES or AI category === 'complaint'
  // -> action needs_attention, NO reply, notify admin
  const lowerText = comment.text.toLowerCase();
  const phraseMatch = LOWER_ESCALATE_PHRASES.some((p) => lowerText.includes(p));

  let detectedCategory: IgCommentCategory | null = phraseMatch ? "complaint" : null;

  if (!detectedCategory && aiClassificationOn) {
    const classification = await classifyComment(comment.text);
    detectedCategory = classification.category;
  }

  if (detectedCategory === "complaint") {
    await db
      .update(igComments)
      .set({
        category: "complaint",
        action: "needs_attention",
        processedAt: new Date(),
      })
      .where(eq(igComments.id, comment.id));

    await notifyIgCommentAttention({
      businessId: params.businessId,
      commentId: comment.id,
      commenterUsername: comment.commenterUsername,
      text: comment.text,
      mediaCaption: comment.mediaCaption,
    });

    emitIgCommentUpdated(params.businessId, { commentId: comment.id, action: "needs_attention" });
    return;
  }

  // 5. Find a rule: active rules sorted by priority;
  // Rule applies if media_ids is empty or contains the comment's media_id.
  const activeRules = await db
    .select()
    .from(igCommentRules)
    .where(and(eq(igCommentRules.businessId, params.businessId), eq(igCommentRules.isActive, true)))
    .orderBy(asc(igCommentRules.priority));

  const applicableRules = activeRules.filter((r) => {
    const mediaIds = (r.mediaIds as string[]) || [];
    return mediaIds.length === 0 || mediaIds.includes(comment.mediaId);
  });

  let matchedRule: (typeof igCommentRules.$inferSelect) | null = null;
  let matchedBy: "keyword" | "ai" | null = null;

  // Keyword match first (word boundary, case-insensitive) -> matched_by 'keyword'.
  for (const rule of applicableRules) {
    const keywords = (rule.keywords as string[]) || [];
    const keywordMatched = keywords.some((kw) => matchesKeyword(comment.text, kw));
    if (keywordMatched) {
      matchedRule = rule;
      matchedBy = "keyword";
      break;
    }
  }

  // Otherwise, if aiClassification is on, pick first rule whose categories include category
  if (!matchedRule && aiClassificationOn && detectedCategory) {
    for (const rule of applicableRules) {
      const categories = (rule.categories as string[]) || [];
      if (categories.includes(detectedCategory)) {
        matchedRule = rule;
        matchedBy = "ai";
        break;
      }
    }
  } else if (!aiClassificationOn) {
    const hasCategoryRules = applicableRules.some(
      (r) => Array.isArray(r.categories) && r.categories.length > 0,
    );
    if (hasCategoryRules) {
      logger.warn(
        { commentId: comment.id, businessId: params.businessId },
        "AI classification is disabled; category-based comment rules will not match",
      );
    }
  }

  // Save category either way
  const finalCategory: IgCommentCategory =
    detectedCategory ??
    ((matchedRule?.categories as string[])?.[0] as IgCommentCategory) ??
    "other";

  // 6. No rule -> skipped (no_match).
  if (!matchedRule) {
    await skipComment(comment.id, params.businessId, "no_match", { category: finalCategory });
    return;
  }

  // 7. One reply per person per post: if another ig_comments row with the same
  // commenter_ig_id + media_id already has action replied_public/dm_sent/replied_both -> skipped (already_replied).
  const [existingReplied] = await db
    .select({ id: igComments.id })
    .from(igComments)
    .where(
      and(
        eq(igComments.businessId, params.businessId),
        eq(igComments.commenterIgId, comment.commenterIgId),
        eq(igComments.mediaId, comment.mediaId),
        ne(igComments.id, comment.id),
        inArray(igComments.action, ["replied_public", "dm_sent", "replied_both"]),
      ),
    );

  if (existingReplied) {
    await skipComment(comment.id, params.businessId, "already_replied", { category: finalCategory, matchedRuleId: matchedRule.id, matchedBy });
    return;
  }

  // 8. DM rules: no DM if commented_at is older than 7 days or customer is opted out
  // -> fall back to public reply only (if rule has public text), else skipped (too_old / opted_out).
  let effectiveReplyMode: "none" | "public" | "dm" | "both" = matchedRule.replyMode;

  if (matchedRule.replyMode === "dm" || matchedRule.replyMode === "both") {
    const isTooOld = Date.now() - new Date(comment.commentedAt).getTime() > 7 * 24 * 60 * 60 * 1000;

    const [existingCust] = await db
      .select({ optedOut: customers.optedOut })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, params.businessId),
          eq(customers.handleOrPhone, comment.commenterIgId),
        ),
      );
    const isOptedOut = existingCust?.optedOut === true;

    if (isTooOld || isOptedOut) {
      const reason = isTooOld ? "too_old" : "opted_out";
      if (matchedRule.replyMode === "both" && matchedRule.publicReplyText?.trim()) {
        effectiveReplyMode = "public";
      } else {
        await skipComment(comment.id, params.businessId, reason, { category: finalCategory, matchedRuleId: matchedRule.id, matchedBy });
        return;
      }
    }
  }

  // 9. Render texts & send
  let publicReplyId: string | null = null;
  let publicReplyText: string | null = null;
  let dmMessageId: string | null = null;
  let dmText: string | null = null;

  // Simulated comments (created by /simulate/ig-comment) have fake metaCommentIds
  // that don't exist on Instagram. Mock the API calls to avoid 400 errors.
  const isSimulated = comment.metaCommentId.startsWith("demo_");

  try {
    if ((effectiveReplyMode === "public" || effectiveReplyMode === "both") && matchedRule.publicReplyText) {
      publicReplyText = renderReplyText(matchedRule.publicReplyText, comment.commenterUsername, comment.mediaCaption);
      if (isSimulated) {
        publicReplyId = `demo_reply_${nanoid()}`;
        logger.info({ commentId: comment.id }, "[SIMULATE] Public reply mocked (not sent to Instagram)");
      } else {
        const replyRes = await replyToComment(comment.metaCommentId, publicReplyText, params.businessId);
        publicReplyId = replyRes.id;
      }
    }

    if ((effectiveReplyMode === "dm" || effectiveReplyMode === "both") && matchedRule.dmText) {
      dmText = renderReplyText(matchedRule.dmText, comment.commenterUsername, comment.mediaCaption);
      if (isSimulated) {
        dmMessageId = `demo_mid_${nanoid()}`;
        logger.info({ commentId: comment.id }, "[SIMULATE] DM reply mocked (not sent to Instagram)");
      } else {
        const dmRes = await sendPrivateReply(comment.metaCommentId, dmText, params.businessId);
        dmMessageId = dmRes.messageId;
      }
    }
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, commentId: comment.id }, "Failed to send Instagram auto-reply");

    await db
      .update(igComments)
      .set({
        action: "failed",
        error: errMsg,
        category: finalCategory,
        matchedRuleId: matchedRule.id,
        matchedBy,
        processedAt: new Date(),
      })
      .where(eq(igComments.id, comment.id));

    await db.insert(auditLog).values({
      businessId: params.businessId,
      actorId: null,
      actorType: "system",
      action: "ig_comment_reply_failed",
      conversationId: null,
      details: {
        commentId: comment.id,
        error: errMsg,
        matchedRuleId: matchedRule.id,
      },
    });

    emitIgCommentUpdated(params.businessId, { commentId: comment.id, action: "failed" });
    throw err;
  }

  // 10. After a DM: find or create customer & conversation, insert system outbound message
  let custId: string | null = null;
  let convId: string | null = null;

  if (dmMessageId && dmText) {
    const [existingChan] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.businessId, params.businessId), eq(channels.type, "instagram")));

    let chanId = existingChan?.id;
    if (!chanId) {
      const [newChan] = await db
        .insert(channels)
        .values({
          businessId: params.businessId,
          type: "instagram",
          identifier: config.INSTAGRAM_ACCOUNT_ID || "instagram-main",
          status: "active",
        })
        .onConflictDoNothing()
        .returning();
      chanId = newChan?.id;
      if (!chanId) {
        const [refetched] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.businessId, params.businessId), eq(channels.type, "instagram")));
        chanId = refetched?.id;
      }
    }

    if (chanId) {
      const [existingCustomer] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, params.businessId),
            eq(customers.channelId, chanId),
            eq(customers.handleOrPhone, comment.commenterIgId),
          ),
        );

      let customer = existingCustomer;
      if (!customer) {
        const [createdCust] = await db
          .insert(customers)
          .values({
            businessId: params.businessId,
            channelId: chanId,
            handleOrPhone: comment.commenterIgId,
            name: comment.commenterUsername
              ? `@${comment.commenterUsername.replace(/^@/, "")}`
              : comment.commenterIgId,
          })
          .returning();
        customer = createdCust;
      }

      if (customer) {
        custId = customer.id;
        const [existingConv] = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.businessId, params.businessId),
              eq(conversations.customerId, customer.id),
            ),
          );

        let conv = existingConv;
        if (!conv) {
          const [createdConv] = await db
            .insert(conversations)
            .values({
              businessId: params.businessId,
              customerId: customer.id,
              channelId: chanId,
              state: "ai_active",
              lastMessageAt: new Date(),
            })
            .returning();
          conv = createdConv;
        }

        if (conv) {
          convId = conv.id;
          const [insertedMsg] = await db
            .insert(messages)
            .values({
              conversationId: conv.id,
              businessId: params.businessId,
              direction: "outbound",
              senderType: "system",
              content: dmText,
              metaMessageId: dmMessageId,
              deliveryStatus: "sent",
              metadata: {
                kind: "ig_comment_dm",
                igCommentId: comment.id,
                mediaId: comment.mediaId,
              },
            })
            .returning();

          await db
            .update(conversations)
            .set({ lastMessageAt: new Date() })
            .where(eq(conversations.id, conv.id));

          if (insertedMsg) {
            emitMessageNew(insertedMsg);
          }
          emitConversationUpdated(params.businessId, {
            conversationId: conv.id,
            state: conv.state,
            tag: conv.tag,
          });
        }
      }
    }
  }

  // 11. Save action, reply texts/ids, audit log, emit
  if (!publicReplyId && !dmMessageId) {
    await skipComment(comment.id, params.businessId, "no_match", { category: finalCategory, matchedRuleId: matchedRule.id, matchedBy });
    return;
  }

  const finalAction: "replied_public" | "dm_sent" | "replied_both" =
    publicReplyId && dmMessageId ? "replied_both" : publicReplyId ? "replied_public" : "dm_sent";

  await db
    .update(igComments)
    .set({
      action: finalAction,
      category: finalCategory,
      matchedRuleId: matchedRule.id,
      matchedBy,
      publicReplyId,
      publicReplyText,
      dmMessageId,
      dmText,
      customerId: custId,
      conversationId: convId,
      processedAt: new Date(),
    })
    .where(eq(igComments.id, comment.id));

  await db.insert(auditLog).values({
    businessId: params.businessId,
    actorId: null,
    actorType: "system",
    action: "ig_comment_replied",
    conversationId: convId,
    details: {
      commentId: comment.id,
      action: finalAction,
      matchedRuleId: matchedRule.id,
      matchedBy,
      category: finalCategory,
    },
  });

  emitIgCommentUpdated(params.businessId, { commentId: comment.id, action: finalAction });
}
