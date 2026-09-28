import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock, SearchX } from "lucide-react";
import { isApiError } from "../api/client.ts";
import { ChatView } from "../components/inbox/ChatView.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Button, buttonVariants } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useConversation } from "../hooks/useConversations.ts";
import { customerLabel } from "../lib/format.ts";

const backLink = (
  <Link to="/escalations" className={buttonVariants({ variant: "outline" })}>
    Back to escalations
  </Link>
);

/** /conversations/:id — one conversation for staff (assigned/unassigned escalations) or admin. */
export default function StaffChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useConversation(id);
  usePageTitle(query.data ? customerLabel(query.data.customer) : "Conversation");

  const goBack = () => {
    // Return to wherever the user came from inside the app (inbox, escalations), else the queue.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/escalations");
  };

  if (!id) return <EmptyState icon={SearchX} title="Conversation not found" action={backLink} className="py-24" />;
  if (query.isPending) return <PageSpinner label="Loading conversation" />;

  if (query.isError) {
    const err = query.error;
    if (isApiError(err) && err.isForbidden) {
      return (
        <EmptyState
          icon={Lock}
          title="This conversation isn't assigned to you"
          description="It may have been resolved or assigned to someone else."
          action={backLink}
          className="py-24"
        />
      );
    }
    if (isApiError(err) && err.status === 404) {
      return <EmptyState icon={SearchX} title="Conversation not found" action={backLink} className="py-24" />;
    }
    return (
      <EmptyState
        icon={AlertCircle}
        title="Couldn't load this conversation"
        description={err.message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void query.refetch()}>Try again</Button>
            {backLink}
          </div>
        }
        className="py-24"
      />
    );
  }

  return (
    <div className="h-full min-h-0">
      <ChatView
        key={id}
        conversation={query.data}
        onBack={goBack}
        onResolved={() => navigate("/escalations", { replace: true })}
      />
    </div>
  );
}
