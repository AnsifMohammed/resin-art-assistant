import { useState } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { AssignModal } from "../components/escalations/AssignModal.tsx";
import { EscalationCard } from "../components/escalations/EscalationCard.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner, Spinner } from "../components/ui/Spinner.tsx";
import { useAuth } from "../hooks/useAuth.ts";
import { useEscalations } from "../hooks/useEscalations.ts";
import { cn } from "../lib/cn.ts";
import type { EscalationListItem } from "../types/index.ts";

/** Admin: every escalation in the business, open (default) or resolved, with assignment. */
export default function AdminEscalations() {
  usePageTitle("Escalations");
  const { user } = useAuth();
  const [showResolved, setShowResolved] = useState(false);
  const query = useEscalations(showResolved ? { resolved: true } : {});
  const [assigning, setAssigning] = useState<EscalationListItem | null>(null);

  const items = query.data ?? [];
  const unassigned = showResolved ? 0 : items.filter((e) => !e.assignedToUserId).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-gray-100 p-1" role="group" aria-label="Show escalations">
          {[
            { label: "Open", value: false },
            { label: "Resolved", value: true },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={showResolved === opt.value}
              onClick={() => setShowResolved(opt.value)}
              className={cn(
                "h-10 rounded-md px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                showResolved === opt.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-gray-500" aria-live="polite">
          {query.isFetching && !query.isPending && <Spinner size="sm" label="Refreshing" />}
          {query.isSuccess &&
            (showResolved
              ? `${items.length} resolved`
              : `${items.length} open${unassigned ? ` · ${unassigned} unassigned` : ""}`)}
        </p>
      </div>

      {query.isPending ? (
        <PageSpinner label="Loading escalations" />
      ) : query.isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load escalations"
          description={query.error.message}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={showResolved ? CheckCircle2 : ShieldCheck}
          title={showResolved ? "No resolved escalations yet" : "All clear"}
          description={showResolved ? undefined : "No conversations need a human right now. The AI is handling everything."}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((e) => (
            <li key={e.id} className="min-w-0">
              <EscalationCard escalation={e} currentUserId={user?.id} isAdmin onAssign={setAssigning} />
            </li>
          ))}
        </ul>
      )}

      <AssignModal escalation={assigning} onClose={() => setAssigning(null)} />
    </div>
  );
}
