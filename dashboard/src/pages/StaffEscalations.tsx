import { AlertCircle, ShieldCheck } from "lucide-react";
import { EscalationCard } from "../components/escalations/EscalationCard.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useAuth } from "../hooks/useAuth.ts";
import { useEscalations } from "../hooks/useEscalations.ts";
import type { EscalationListItem } from "../types/index.ts";

function Section({
  title,
  items,
  empty,
  userId,
}: {
  title: string;
  items: EscalationListItem[];
  empty: string;
  userId: string | undefined;
}) {
  const headingId = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {title}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">{empty}</p>
      ) : (
        // <ul className="grid gap-3 md:grid-cols-2">
        <ul className="mx-auto grid w-full max-w-3xl grid-cols-1 justify-items-center gap-4">

          {items.map((e) => (
            <li key={e.id} className="w-full min-w-0">
              <EscalationCard escalation={e} currentUserId={userId} isAdmin={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Staff queue: escalations assigned to me + unassigned ones (server-scoped). */
export default function StaffEscalations() {
  usePageTitle("My escalations");
  const { user } = useAuth();
  const query = useEscalations();

  if (query.isPending) return <PageSpinner label="Loading escalations" />;
  if (query.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load escalations"
        description={query.error.message}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
        className="py-24"
      />
    );
  }

  // Defensive client-side scoping (the server already filters for staff).
  const open = query.data.filter((e) => !e.resolvedAt);
  const mine = open.filter((e) => user && e.assignedToUserId === user.id);
  const unassigned = open.filter((e) => !e.assignedToUserId);

  if (mine.length === 0 && unassigned.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="All caught up"
        description="Nothing needs you right now. New escalations will pop up here."
        className="py-24"
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 md:px-6 md:py-6">
      <Section title="Assigned to me" items={mine} empty="Nothing assigned to you." userId={user?.id} />
      <Section title="Unassigned" items={unassigned} empty="No unassigned escalations." userId={user?.id} />
    </div>
  );
}
