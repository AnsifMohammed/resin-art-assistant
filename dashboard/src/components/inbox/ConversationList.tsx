import { useId } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import { stateLabels } from "../ui/Badge.tsx";
import { fieldBase } from "../ui/Input.tsx";
import { cn } from "../../lib/cn.ts";
import { humanize } from "../../lib/format.ts";
import { useInfiniteConversations, type ConversationFilters } from "../../hooks/useConversations.ts";
import { CHANNEL_TYPES, CONV_STATES, CONV_TAGS } from "../../types/index.ts";
import { channelLabels } from "../ui/ChannelIcon.tsx";
import { ConversationItem } from "./ConversationItem.tsx";

function FilterSelect<T extends string>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly T[];
  format: (v: T) => string;
  onChange: (v: T | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
        className={cn(fieldBase, "h-10 w-full truncate border-gray-300 pl-2 pr-7 text-sm", value && "border-emerald-400 bg-emerald-50/50")}
      >
        <option value="">{`${label}: all`}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ConversationList({
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
}: {
  filters: ConversationFilters;
  onFiltersChange: (f: ConversationFilters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const query = useInfiniteConversations(filters);
  // Dedupe: a conversation can shift across page boundaries when new messages arrive.
  const items = [...new Map((query.data?.pages.flatMap((p) => p.conversations) ?? []).map((c) => [c.id, c])).values()];
  const total = query.data?.pages[0]?.pagination.total ?? 0;
  const hasFilters = Boolean(filters.state || filters.tag || filters.channel);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="grid grid-cols-3 gap-2 border-b border-gray-200 p-3" role="group" aria-label="Filter conversations">
        <FilterSelect
          label="State"
          value={filters.state}
          options={CONV_STATES}
          format={(s) => stateLabels[s]}
          onChange={(state) => onFiltersChange({ ...filters, state })}
        />
        <FilterSelect
          label="Tag"
          value={filters.tag}
          options={CONV_TAGS}
          format={humanize}
          onChange={(tag) => onFiltersChange({ ...filters, tag })}
        />
        <FilterSelect
          label="Channel"
          value={filters.channel}
          options={CHANNEL_TYPES}
          format={(c) => channelLabels[c]}
          onChange={(channel) => onFiltersChange({ ...filters, channel })}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500">
        <span aria-live="polite">
          {query.isSuccess ? `${total} conversation${total === 1 ? "" : "s"}` : " "}
        </span>
        {query.isFetching && !query.isFetchingNextPage && <Spinner size="sm" label="Refreshing" />}
        {hasFilters && (
          <button
            type="button"
            onClick={() => onFiltersChange({})}
            className="-my-2 h-8 rounded px-2 font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" label="Loading conversations" />
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load conversations"
            description={query.error.message}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={hasFilters ? "No matching conversations" : "No conversations yet"}
            description={hasFilters ? "Try clearing the filters." : "New customer messages will show up here."}
          />
        ) : (
          <ul>
            {items.map((c) => (
              <li key={c.id}>
                <ConversationItem conversation={c} selected={c.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
            {query.hasNextPage && (
              <li className="p-3">
                <Button
                  variant="outline"
                  block
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load more
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
