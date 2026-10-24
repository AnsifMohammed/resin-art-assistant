import { AlertCircle } from "lucide-react";
import { Badge } from "../ui/Badge.tsx";
import { cn } from "../../lib/cn.ts";
import { escalationReasonColor, escalationReasonLabel } from "../../lib/escalationReasons.ts";
import type { EscalationReason } from "../../types/index.ts";

export function EscalationBadge({ reason, className }: { reason: EscalationReason | string; className?: string }) {
  const label = escalationReasonLabel(reason);
  return (
    <Badge className={cn(escalationReasonColor(reason), className)} title={`Escalation reason: ${label}`}>
      <AlertCircle className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Badge>
  );
}
