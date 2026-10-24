import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Bot,
  Cpu,
  Clock,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { useAuditLog } from "../hooks/useAuditLog.ts";
import { useUsers } from "../hooks/useUsers.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { Avatar } from "../components/shared/Avatar.tsx";
import { formatDateTime, formatRelative, humanize } from "../lib/format.ts";
import type { AuditLogEntry, AuditLogParams } from "../types/index.ts";

const PAGE_SIZE = 25;

interface ActionBadgeConfig {
  label: string;
  className: string;
}

function getActionBadge(action: string): ActionBadgeConfig {
  switch (action) {
    case "reply_sent":
      return {
        label: "Reply sent",
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
      };
    case "auto_reply_sent":
      return {
        label: "Auto-reply sent",
        className: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
      };
    case "escalation_created":
      return {
        label: "Escalation created",
        className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      };
    case "escalation_assigned":
      return {
        label: "Escalation assigned",
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      };
    case "conversation_resolved":
    case "resolved":
      return {
        label: "Resolved",
        className: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
      };
    case "user_created":
    case "staff_added":
      return {
        label: "Staff added",
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      };
    case "settings_changed":
    case "automation_paused":
    case "automation_resumed":
    case "knowledge_base_updated":
      return {
        label: "Settings changed",
        className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      };
    default:
      return {
        label: humanize(action),
        className: "bg-surface-muted text-text-muted border-border",
      };
  }
}

function ActorCell({ entry }: { entry: AuditLogEntry }) {
  if (entry.actorType === "ai") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4" />
        </div>
        <div>
          <span className="font-semibold text-text text-sm">AI Assistant</span>
          <span className="block text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Automated
          </span>
        </div>
      </div>
    );
  }

  if (entry.actorType === "system") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-surface-muted text-text-muted border border-border flex items-center justify-center shrink-0">
          <Cpu className="w-4 h-4" />
        </div>
        <div>
          <span className="font-semibold text-text text-sm">System</span>
          <span className="block text-[11px] text-text-muted">Background process</span>
        </div>
      </div>
    );
  }

  const name = entry.actorName || "Staff member";
  const isAdmin = entry.actorType === "admin";

  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-text text-sm truncate">{name}</span>
          <span
            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
              isAdmin
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                : "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
            }`}
          >
            {isAdmin ? "Admin" : "Staff"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AuditLog() {
  const { user: currentUser } = useAuth();
  const staffQuery = useUsers();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const actionFilter = searchParams.get("action") ?? "";
  const actorFilter = searchParams.get("actorId") ?? "";

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryParams: AuditLogParams = { page, limit: PAGE_SIZE };
  if (actionFilter) queryParams.action = actionFilter;
  if (actorFilter) queryParams.actorId = actorFilter;

  const logQuery = useAuditLog(queryParams);
  const entries = logQuery.data?.entries ?? [];
  const total = logQuery.data?.pagination.total ?? 0;
  const limit = logQuery.data?.pagination.limit ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(newPage));
    }
    setSearchParams(next, { replace: true });
  };

  // Export current rows to CSV
  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast.info("No rows to export");
      return;
    }

    const headers = ["Timestamp", "Date Time", "Actor", "Actor Type", "Action", "Conversation ID", "Details"];
    const rows = entries.map((e) => [
      e.createdAt,
      formatDateTime(e.createdAt),
      e.actorName || (e.actorType === "ai" ? "AI Assistant" : e.actorType === "system" ? "System" : "Unknown"),
      e.actorType,
      getActionBadge(e.action).label,
      e.conversationId || "",
      JSON.stringify(e.details || {}).replace(/"/g, '""'),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `saba-art-audit-log-page-${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${entries.length} audit entries to CSV`);
  };

  const actorOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [];
    if (currentUser) {
      opts.push({ id: currentUser.id, label: `${currentUser.name} (You)` });
    }
    for (const s of staffQuery.data ?? []) {
      if (s.id !== currentUser?.id) {
        opts.push({ id: s.id, label: `${s.name} (Staff)` });
      }
    }
    return opts;
  }, [currentUser, staffQuery.data]);

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text tracking-tight flex items-center gap-2">
            <span>Audit log</span>
            {total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-text">
                {total} entries
              </span>
            )}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Every reply, hand-over and change, with who did it
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-surface text-text hover:bg-surface-muted font-semibold text-sm shadow-xs transition cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-primary" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* ─── Filters Row (Actor & Action only) ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted pl-1">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span>Filters:</span>
        </div>

        {/* Actor Filter */}
        <div className="relative inline-flex items-center">
          <select
            value={actorFilter}
            aria-label="Filter by actor"
            onChange={(e) => setFilter("actorId", e.target.value)}
            className="h-8 pl-3 pr-8 appearance-none bg-surface-muted border border-border text-text text-12 font-medium rounded-lg focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="">All actors</option>
            {actorOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
        </div>

        {/* Action Filter */}
        <div className="relative inline-flex items-center">
          <select
            value={actionFilter}
            aria-label="Filter by action"
            onChange={(e) => setFilter("action", e.target.value)}
            className="h-8 pl-3 pr-8 appearance-none bg-surface-muted border border-border text-text text-12 font-medium rounded-lg focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="">All actions</option>
            <option value="reply_sent">Reply sent</option>
            <option value="auto_reply_sent">Auto-reply sent</option>
            <option value="escalation_created">Escalation created</option>
            <option value="escalation_assigned">Escalation assigned</option>
            <option value="conversation_resolved">Resolved</option>
            <option value="user_created">Staff added</option>
            <option value="settings_changed">Settings changed</option>
            <option value="knowledge_base_updated">Knowledge base updated</option>
            <option value="automation_paused">Automation paused</option>
            <option value="automation_resumed">Automation resumed</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
        </div>

        {(actorFilter || actionFilter) && (
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("actorId");
              next.delete("action");
              next.delete("page");
              setSearchParams(next, { replace: true });
            }}
            className="text-xs text-primary-text hover:underline cursor-pointer ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ─── DataTable / Skeletons / Empty State ──────────────────────────────── */}
      {logQuery.isPending ? (
        /* Loading Skeletons */
        <div className="rounded-xl border border-border bg-surface p-4 divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-muted" />
                <div className="w-36 h-4 rounded bg-surface-muted" />
              </div>
              <div className="w-28 h-6 rounded-full bg-surface-muted" />
              <div className="w-20 h-4 rounded bg-surface-muted" />
              <div className="w-24 h-4 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-border bg-surface p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-surface-muted text-text-muted flex items-center justify-center mx-auto">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold font-display text-text">No audit entries found</h3>
            <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">
              {actorFilter || actionFilter
                ? "No log entries match the selected filters. Try resetting the filters."
                : "No audit events recorded yet."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table (hidden on mobile) */}
          <div className="hidden md:block rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-text-muted text-xs font-semibold uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Conversation</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const badge = getActionBadge(entry.action);
                  const isExpanded = expandedId === entry.id;

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="hover:bg-surface-muted/30 transition-colors cursor-pointer group"
                    >
                      {/* Actor */}
                      <td className="px-4 py-3">
                        <ActorCell entry={entry} />
                      </td>

                      {/* Action Badge */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Conversation Link */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {entry.conversationId ? (
                          <Link
                            to={`/inbox?id=${encodeURIComponent(entry.conversationId)}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      {/* Relative Time with Full Date on Hover */}
                      <td className="px-4 py-3">
                        <span
                          title={formatDateTime(entry.createdAt)}
                          className="text-text-muted text-sm tabular-nums flex items-center gap-1"
                        >
                          <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <span>{formatRelative(entry.createdAt)}</span>
                        </span>
                      </td>

                      {/* Expand / Collapse Button */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : entry.id);
                          }}
                          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expandable Details Container for the active row */}
            {expandedId && (
              (() => {
                const activeEntry = entries.find((e) => e.id === expandedId);
                if (!activeEntry) return null;
                return (
                  <div className="p-4 border-t border-border bg-surface-muted/50 text-xs font-mono text-text space-y-2">
                    <div className="flex items-center justify-between text-text-muted text-[11px] font-sans">
                      <span className="font-semibold text-text">Event Payload Details (ID: {activeEntry.id})</span>
                      <span>Recorded: {formatDateTime(activeEntry.createdAt)}</span>
                    </div>
                    <pre className="p-3 rounded-lg bg-surface border border-border overflow-x-auto text-[11px] leading-relaxed">
                      {JSON.stringify(activeEntry.details, null, 2)}
                    </pre>
                  </div>
                );
              })()
            )}
          </div>

          {/* Mobile Stacked Cards (visible < md) */}
          <div className="md:hidden space-y-3">
            {entries.map((entry) => {
              const badge = getActionBadge(entry.action);
              const isExpanded = expandedId === entry.id;

              return (
                <div
                  key={entry.id}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <ActorCell entry={entry} />
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-text-muted">
                    <span title={formatDateTime(entry.createdAt)}>
                      {formatRelative(entry.createdAt)}
                    </span>

                    <div className="flex items-center gap-3">
                      {entry.conversationId && (
                        <Link
                          to={`/inbox?id=${encodeURIComponent(entry.conversationId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline"
                        >
                          <span>Open Chat</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <span className="text-text-muted">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t border-border space-y-1.5 text-[11px] font-mono">
                      <p className="font-sans font-semibold text-text text-xs">Event Payload:</p>
                      <pre className="p-2.5 rounded-lg bg-surface-muted border border-border overflow-x-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ─── Pagination Bar ─────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface text-sm text-text-muted">
              <span className="text-xs">
                Page <span className="font-semibold text-text">{page}</span> of{" "}
                <span className="font-semibold text-text">{totalPages}</span> ({total} items)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text hover:bg-surface text-xs font-semibold cursor-pointer disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface-muted text-text hover:bg-surface text-xs font-semibold cursor-pointer disabled:opacity-40 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
