import { publish } from "./bus.ts";
import type {
  ConversationUpdatedPayload,
  EscalationAssignedPayload,
  EscalationNewPayload,
  MessageRow,
  SettingsUpdatedPayload,
} from "./websocket.ts";

/**
 * The only functions routes and jobs should call to emit realtime events.
 * Who receives what is decided in websocket.ts (deliverLocal); see
 * docs/contracts.md "Real-time" for the event list and scoping.
 */

/** A message was stored (customer, AI, owner, staff, echo or system). */
export function emitMessageNew(message: MessageRow | null | undefined): void {
  if (!message) return;
  publish({ kind: "message:new", businessId: message.businessId, conversationId: message.conversationId, message });
}

/** A conversation's state or tag changed. Admin only. */
export function emitConversationUpdated(businessId: string, payload: ConversationUpdatedPayload): void {
  publish({ kind: "conversation:updated", businessId, payload });
}

/** An escalation was created. Admin + all staff of the business. */
export function emitEscalationNew(businessId: string, payload: EscalationNewPayload): void {
  publish({ kind: "escalation:new", businessId, payload });
}

/**
 * An escalation was assigned or unassigned. Admins get `escalation:assigned`;
 * the new and the previous assignee get `escalation:assigned:<theirId>`.
 * Also re-checks staff message subscriptions for the conversation.
 */
export function emitEscalationAssigned(
  businessId: string,
  payload: EscalationAssignedPayload,
  previousAssigneeId: string | null = null,
): void {
  publish({ kind: "escalation:assigned", businessId, payload, previousAssigneeId });
  publish({ kind: "access:changed", businessId, conversationId: payload.conversationId });
}

/** Staff access to a conversation may have changed (e.g. its escalation was resolved). */
export function emitConversationAccessChanged(businessId: string, conversationId: string): void {
  publish({ kind: "access:changed", businessId, conversationId });
}

/** Business settings changed (pause/resume). Admin only. */
export function emitSettingsUpdated(businessId: string, payload: SettingsUpdatedPayload): void {
  publish({ kind: "settings:updated", businessId, payload });
}

/** Close a user's sockets on every API process (deactivation). */
export function disconnectUserEverywhere(businessId: string, userId: string): void {
  publish({ kind: "user:disconnect", businessId, userId });
}
