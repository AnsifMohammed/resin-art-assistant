import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, MessagesSquare, SearchX } from "lucide-react";
import { isApiError } from "../api/client.ts";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { ChatView } from "../components/inbox/ChatView.tsx";
import { ConversationList } from "../components/inbox/ConversationList.tsx";
import type { ConversationFilters } from "../hooks/useConversations.ts";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useConversation } from "../hooks/useConversations.ts";
import { cn } from "../lib/cn.ts";
import { CHANNEL_TYPES, CONV_STATES, CONV_TAGS } from "../types/index.ts";

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function ConversationPane({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useConversation(id);

  if (query.isPending) return <PageSpinner label="Loading conversation" />;
  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404;
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 p-2 md:hidden">
          <Button variant="ghost" onClick={onBack}>
            ← Back to inbox
          </Button>
        </div>
        <EmptyState
          icon={notFound ? SearchX : AlertCircle}
          title={notFound ? "Conversation not found" : "Couldn't load this conversation"}
          description={notFound ? "It may have been removed." : query.error.message}
          action={
            notFound ? undefined : (
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            )
          }
          className="flex-1"
        />
      </div>
    );
  }
  return <ChatView key={id} conversation={query.data} onBack={onBack} backOnlyOnMobile />;
}

/** Admin inbox: list + chat side by side on desktop; list → chat drill-down on phones. State lives in the URL. */
export default function AdminInbox() {
  usePageTitle("Inbox");
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("c");
  const filters: ConversationFilters = {
    state: pick(params.get("state"), CONV_STATES),
    tag: pick(params.get("tag"), CONV_TAGS),
    channel: pick(params.get("channel"), CHANNEL_TYPES),
  };

  const update = useCallback(
    (changes: Record<string, string | undefined | null>, replace = false) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "min-h-0 w-full border-gray-200 md:block md:w-80 md:shrink-0 md:border-r lg:w-96",
          selectedId ? "hidden" : "block",
        )}
      >
        <ConversationList
          filters={filters}
          onFiltersChange={(f) => update({ state: f.state, tag: f.tag, channel: f.channel }, true)}
          selectedId={selectedId}
          onSelect={(id) => update({ c: id })}
        />
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 bg-white md:block", selectedId ? "block" : "hidden")}>
        {selectedId ? (
          <ConversationPane id={selectedId} onBack={() => update({ c: null })} />
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="Select a conversation"
            description="Pick a customer on the left to read the thread and reply."
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
