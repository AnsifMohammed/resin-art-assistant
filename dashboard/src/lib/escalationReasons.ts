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

/** Badge colours per reason with theme-aware soft tints and subtle borders. */
export const escalationReasonColors: Record<EscalationReason, string> = {
  intent_complaint: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  intent_refund: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  intent_unknown: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  intent_off_topic: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20",
  intent_payment: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  missing_facts: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  always_escalate_phrase: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  payment_claim: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  unapproved_intent: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  window_closed: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  parse_error: "bg-surface-muted text-text-muted border-border/70",
  manual: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
};

const isKnownReason = (reason: string): reason is EscalationReason => reason in escalationReasonLabels;

/** Human label for any reason string (falls back for values outside the enum). */
export function escalationReasonLabel(reason: string): string {
  if (isKnownReason(reason)) return escalationReasonLabels[reason];
  const s = reason.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Badge colour for any reason string (neutral surface for unknown values). */
export function escalationReasonColor(reason: string): string {
  return isKnownReason(reason) ? escalationReasonColors[reason] : "bg-surface-muted text-text-muted border-border/70";
}
