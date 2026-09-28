import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, X } from "lucide-react";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Badge, RoleBadge } from "../components/ui/Badge.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { fieldBase } from "../components/ui/Input.tsx";
import { PageSpinner, Spinner } from "../components/ui/Spinner.tsx";
import { useAuditLog } from "../hooks/useAuditLog.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { useUsers } from "../hooks/useUsers.ts";
import { cn } from "../lib/cn.ts";
import { formatDateTime, formatShortDate, humanize, humanizeKey } from "../lib/format.ts";
import type { AuditLogEntry, AuditLogParams } from "../types/index.ts";

const PAGE_SIZE = 25;

/** Known audit actions (from backend routes + CLAUDE.md). Unknown ones fall back to humanize(). */
const ACTION_LABELS: Record<string, string> = {
  reply_sent: "Reply sent",
  auto_reply_sent: "AI auto-reply sent",
  escalation_created: "Escalation created",
  escalation_assigned: "Escalation assigned",
  escalation_reminded: "Escalation reminder sent",
  conversation_resolved: "Conversation resolved",
  automation_paused: "Automation paused",
  automation_resumed: "Automation resumed",
  knowledge_base_updated: "Knowledge base updated",
  user_created: "Staff account created",
  user_deactivated: "Staff account deactivated",
  user_reactivated: "Staff account reactivated",
  state_changed: "Conversation state changed",
};
const actionLabel = (a: string) => ACTION_LABELS[a] ?? humanize(a);

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringify).join(", ");
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/** One-line human summary of the details blob. Prefers a message preview, then a few key: value pairs. */
function detailsPreview(details: Record<string, unknown> | null | undefined): string {
  if (!details || typeof details !== "object") return "";
  const preview = details.preview ?? details.text ?? details.lastMessage;
  if (typeof preview === "string" && preview) return `“${preview}”`;
  return Object.entries(details)
    .filter(([k]) => k !== "messageId" && !/password|hash|token/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => `${humanizeKey(k)}: ${stringify(v)}`)
    .join(" · ");
}

function Actor({ entry }: { entry: AuditLogEntry }) {
  if (entry.actorType === "ai") return <Badge className="bg-blue-50 text-blue-800">AI</Badge>;
  if (entry.actorType === "system") return <Badge>System</Badge>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate text-sm text-gray-900">{entry.actorName ?? "Unknown user"}</span>
      <RoleBadge role={entry.actorType} />
    </span>
  );
}

function ConversationLink({ id }: { id: string | null }) {
  if (!id) return <span className="text-sm text-gray-400">—</span>;
  return (
    <Link
      to={`/conversations/${encodeURIComponent(id)}`}
      className="inline-flex min-h-10 items-center gap-1 rounded text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:min-h-0"
    >
      Open
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">conversation {id}</span>
    </Link>
  );
}

const selectClass = cn(fieldBase, "h-11 border-gray-300 pr-8");

export default function AuditLog() {
  usePageTitle("Audit log");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const action = params.get("action") ?? "";
  const actorId = params.get("actorId") ?? "";

  const query: AuditLogParams = { page, limit: PAGE_SIZE };
  if (action) query.action = action;
  if (actorId) query.actorId = actorId;
  const log = useAuditLog(query);
  const staff = useUsers();

  const actorOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [];
    if (user) opts.push({ id: user.id, label: `${user.name} (you)` });
    for (const s of staff.data ?? []) if (s.id !== user?.id) opts.push({ id: s.id, label: s.name });
    return opts;
  }, [user, staff.data]);

  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (k === "page" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  const entries = log.data?.entries ?? [];
  const total = log.data?.pagination.total ?? 0;
  const limit = log.data?.pagination.limit ?? PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const hasFilters = Boolean(action || actorId);

  let body;
  if (log.isPending) body = <PageSpinner label="Loading audit log" />;
  else if (log.isError && !log.data)
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the audit log"
        description={log.error.message}
        action={
          <Button variant="outline" onClick={() => void log.refetch()}>
            Try again
          </Button>
        }
      />
    );
  else if (entries.length === 0)
    body = (
      <EmptyState
        icon={ClipboardList}
        title={hasFilters ? "No matching entries" : "No activity yet"}
        description={hasFilters ? "Try clearing the filters." : "Replies, escalations and settings changes will appear here."}
        {...(hasFilters
          ? {
              action: (
                <Button variant="outline" onClick={() => update({ action: null, actorId: null, page: null })}>
                  Clear filters
                </Button>
              ),
            }
          : {})}
      />
    );
  else
    body = (
      <div className={cn("transition-opacity", log.isPlaceholderData && "opacity-60")}>
        {/* Phone: cards */}
        <ul className="space-y-2 md:hidden" aria-label="Audit log entries">
          {entries.map((e) => {
            const preview = detailsPreview(e.details);
            return (
              <li key={e.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-gray-900">{actionLabel(e.action)}</p>
                  <time className="shrink-0 text-xs text-gray-500" dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                    {formatShortDate(e.createdAt)}
                  </time>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <Actor entry={e} />
                  {e.conversationId && <ConversationLink id={e.conversationId} />}
                </div>
                {preview && <p className="mt-1 line-clamp-2 break-words text-sm text-gray-500">{preview}</p>}
              </li>
            );
          })}
        </ul>

        {/* md+: table */}
        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="w-40 px-4 py-2 font-medium">Time</th>
                <th scope="col" className="w-48 px-4 py-2 font-medium">Actor</th>
                <th scope="col" className="w-52 px-4 py-2 font-medium">Action</th>
                <th scope="col" className="w-28 px-4 py-2 font-medium">Conversation</th>
                <th scope="col" className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => {
                const preview = detailsPreview(e.details);
                return (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3 text-gray-600">
                      <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                    </td>
                    <td className="px-4 py-3">
                      <Actor entry={e} />
                    </td>
                    <td className="px-4 py-3 text-gray-900">{actionLabel(e.action)}</td>
                    <td className="px-4 py-3">
                      <ConversationLink id={e.conversationId} />
                    </td>
                    <td className="truncate px-4 py-3 text-gray-500" title={preview}>
                      {preview || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-sm text-gray-500">
            Page {page} of {pageCount} · {total} {total === 1 ? "entry" : "entries"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= pageCount}
              onClick={() => update({ page: page + 1 })}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </nav>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="block text-sm font-medium text-gray-700">
            Action
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => update({ action: e.target.value, page: null })}
            className={selectClass}
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            {action && !ACTION_LABELS[action] && <option value={action}>{humanize(action)}</option>}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="audit-actor" className="block text-sm font-medium text-gray-700">
            Actor
          </label>
          <select
            id="audit-actor"
            value={actorId}
            onChange={(e) => update({ actorId: e.target.value, page: null })}
            className={selectClass}
          >
            <option value="">Everyone (incl. AI)</option>
            {actorOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            {actorId && !actorOptions.some((o) => o.id === actorId) && <option value={actorId}>Selected user</option>}
          </select>
        </div>
        <div className="flex h-11 items-center gap-2 empty:hidden">
          {log.isFetching && !log.isPending && <Spinner size="sm" label="Refreshing" />}
          {hasFilters && (
            <Button variant="ghost" className="h-11" onClick={() => update({ action: null, actorId: null, page: null })}>
              <X className="h-4 w-4" aria-hidden />
              Clear
            </Button>
          )}
        </div>
      </div>

      {body}
    </div>
  );
}
