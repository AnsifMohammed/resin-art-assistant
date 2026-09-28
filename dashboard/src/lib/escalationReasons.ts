import type { EscalationReason } from "../types/index.ts";

/** Short human labels for escalation reasons (backend escalation_reason enum). */
export const escalationReasonLabels: Record<EscalationReason, string> = {
  intent_complaint: "Complaint",
  intent_refund: "Refund request",
  intent_unknown: "Unclear request",
  intent_off_topic: "Off topic",
  intent_payment: "Payment question",
  missing_facts: "Missing info",
  always_escalate_phrase: "Sensitive phrase",
  payment_claim: "Payment claim",
  unapproved_intent: "Needs approval",
  window_closed: "24h window closed",
  parse_error: "AI error",
  manual: "Manual",
};

/** Badge colours per reason. */
export const escalationReasonColors: Record<EscalationReason, string> = {
  intent_complaint: "bg-red-100 text-red-800",
  intent_refund: "bg-rose-100 text-rose-800",
  intent_unknown: "bg-slate-100 text-slate-700",
  intent_off_topic: "bg-zinc-100 text-zinc-700",
  intent_payment: "bg-lime-100 text-lime-800",
  missing_facts: "bg-amber-100 text-amber-800",
  always_escalate_phrase: "bg-orange-100 text-orange-800",
  payment_claim: "bg-yellow-100 text-yellow-800",
  unapproved_intent: "bg-purple-100 text-purple-800",
  window_closed: "bg-cyan-100 text-cyan-800",
  parse_error: "bg-gray-200 text-gray-700",
  manual: "bg-blue-100 text-blue-800",
};

const isKnownReason = (reason: string): reason is EscalationReason => reason in escalationReasonLabels;

/** Human label for any reason string (falls back for values outside the enum). */
export function escalationReasonLabel(reason: string): string {
  if (isKnownReason(reason)) return escalationReasonLabels[reason];
  const s = reason.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Badge colour for any reason string (neutral grey for unknown values). */
export function escalationReasonColor(reason: string): string {
  return isKnownReason(reason) ? escalationReasonColors[reason] : "bg-gray-100 text-gray-700";
}
