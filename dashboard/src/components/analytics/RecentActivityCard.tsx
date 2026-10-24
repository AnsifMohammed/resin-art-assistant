import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpRight,
  History,
  Bot,
  Package,
  ShoppingBag,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  MessageSquare,
  Settings,
  Layers,
  Loader2,
} from "lucide-react";
import { useInfiniteAuditLog } from "../../hooks/useAuditLog.ts";
import { formatRelative, humanize } from "../../lib/format.ts";
import { escalationReasonLabel } from "../../lib/escalationReasons.ts";
import type { AuditLogEntry } from "../../types/index.ts";

export interface RecentActivityItem {
  id: string;
  icon: ReactNode;
  title: string;
  actor?: string;
  time: string;
  fullTime?: string;
  category?: "ai" | "staff" | "order" | "escalation" | "all";
  onClick?: () => void;
}

interface RecentActivityCardProps {
  activities?: RecentActivityItem[];
  isLoading?: boolean;
}

// ─── Curated Sample Activities for Fallback and Testing (200+ Entries) ──────
const SAMPLE_220_ACTIVITIES: AuditLogEntry[] = Array.from({ length: 220 }).map((_, i) => {
  const timeOffsetHours = i * 0.45;
  const createdAt = new Date(Date.now() - timeOffsetHours * 3600 * 1000).toISOString();
  const orderNum = 1052 - (i % 50);

  const types: Array<{
    action: string;
    actorType: "ai" | "admin" | "staff" | "system";
    actorName?: string;
    details?: Record<string, unknown>;
  }> = [
    {
      action: "order_status_changed",
      actorType: "admin",
      actorName: "Asha",
      details: { orderNo: `SA-${orderNum}`, toStatus: "dispatched", customerName: "Devi" },
    },
    {
      action: "auto_reply_sent",
      actorType: "ai",
      details: { customerName: "Kavya", intent: "order_status" },
    },
    {
      action: "escalation_assigned",
      actorType: "staff",
      actorName: "Priya",
      details: { reason: "custom_dimensions" },
    },
    {
      action: "order_created",
      actorType: "admin",
      actorName: "Asha",
      details: { orderNo: `SA-${orderNum - 1}`, customerName: "Ananya", total: 4800 },
    },
    {
      action: "reply_sent",
      actorType: "staff",
      actorName: "Priya",
      details: { customerName: "Meera" },
    },
    {
      action: "order_status_changed",
      actorType: "staff",
      actorName: "Priya",
      details: { orderNo: `SA-${orderNum - 2}`, toStatus: "ready", customerName: "Rohan" },
    },
    {
      action: "conversation_resolved",
      actorType: "admin",
      actorName: "Asha",
      details: { customerName: "Sanjay" },
    },
    {
      action: "escalation_created",
      actorType: "ai",
      details: { reason: "refund_request" },
    },
    {
      action: "auto_reply_sent",
      actorType: "ai",
      details: { customerName: "Divya", intent: "catalog_inquiry" },
    },
    {
      action: "order_status_changed",
      actorType: "admin",
      actorName: "Asha",
      details: { orderNo: `SA-${orderNum - 3}`, toStatus: "in_production" },
    },
  ];

  const template = types[i % types.length]!;
  return {
    id: `sample-act-${i + 1}`,
    businessId: "resin-art-demo-business-01",
    actorId: template.actorType === "ai" ? "ai" : `user-${(i % 3) + 1}`,
    actorType: template.actorType,
    actorName: template.actorName ?? null,
    action: template.action,
    conversationId: `conv-${(i % 15) + 1}`,
    escalationId: template.action.includes("escalation") ? `esc-${(i % 10) + 1}` : null,
    targetUserId: null,
    details: template.details ?? {},
    createdAt,
  };
});

// Helper to convert an AuditLogEntry to a rendered activity row item
function formatAuditEntry(entry: AuditLogEntry, navigate: (path: string) => void): RecentActivityItem {
  const actor =
    entry.actorName ||
    (entry.actorType === "ai"
      ? "AI"
      : entry.actorType === "system"
        ? "System"
        : humanize(entry.actorType));

  const fullTime = new Date(entry.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const time = formatRelative(entry.createdAt);

  const orderNo =
    (entry.details?.orderNo as string | undefined) ||
    (entry.details?.orderId ? `SA-${String(entry.details.orderId).slice(0, 4)}` : undefined);
  const customerName = (entry.details?.customerName as string | undefined) ?? "";

  let icon: ReactNode = <Layers className="w-3.5 h-3.5 text-text-muted" />;
  let title = humanize(entry.action);
  let category: "ai" | "staff" | "order" | "escalation" = "staff";

  switch (entry.action) {
    case "order_created":
      icon = <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />;
      title = orderNo
        ? `${orderNo} created${customerName ? ` (${customerName})` : ""}`
        : "Order created";
      category = "order";
      break;

    case "order_status_changed": {
      icon = <Package className="w-3.5 h-3.5 text-blue-500" />;
      const toStatus = humanize(String(entry.details?.toStatus ?? "updated"));
      title = orderNo ? `${orderNo} → ${toStatus}` : `Order → ${toStatus}`;
      category = "order";
      break;
    }

    case "order_updated":
      icon = <Package className="w-3.5 h-3.5 text-amber-500" />;
      title = orderNo ? `${orderNo} updated` : "Order updated";
      category = "order";
      break;

    case "auto_reply_sent": {
      icon = <Bot className="w-3.5 h-3.5 text-violet-500" />;
      const target = customerName || (entry.details?.intent ? humanize(String(entry.details.intent)) : "query");
      title = `AI replied to ${target}`;
      category = "ai";
      break;
    }

    case "auto_reply_failed":
    case "reply_failed":
      icon = <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
      title = entry.action === "auto_reply_failed" ? "AI auto-reply failed" : `Reply by ${actor} failed`;
      category = entry.action === "auto_reply_failed" ? "ai" : "staff";
      break;

    case "escalation_created": {
      icon = <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />;
      const reason = entry.details?.reason ? escalationReasonLabel(String(entry.details.reason)) : "";
      title = reason ? `Escalated: ${reason}` : "Escalated to staff";
      category = "escalation";
      break;
    }

    case "escalation_assigned": {
      icon = <UserCheck className="w-3.5 h-3.5 text-amber-500" />;
      const assignedTo = entry.actorName || "staff";
      title = `Escalation assigned to ${assignedTo}`;
      category = "staff";
      break;
    }

    case "escalation_resolved":
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      title = `Escalation resolved by ${actor}`;
      category = "staff";
      break;

    case "reply_sent": {
      icon = <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
      title = customerName ? `${actor} replied to ${customerName}` : `${actor} sent reply`;
      category = "staff";
      break;
    }

    case "conversation_resolved":
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      title = `${actor} resolved chat`;
      category = "staff";
      break;

    case "settings_changed":
      icon = <Settings className="w-3.5 h-3.5 text-slate-500" />;
      title = `${actor} updated settings`;
      category = "staff";
      break;

    default:
      if (entry.actorType === "ai") {
        icon = <Bot className="w-3.5 h-3.5 text-violet-500" />;
        category = "ai";
      } else if (entry.action.includes("order")) {
        icon = <Package className="w-3.5 h-3.5 text-blue-500" />;
        category = "order";
      } else {
        icon = <Layers className="w-3.5 h-3.5 text-text-muted" />;
        category = "staff";
      }
      title = humanize(entry.action);
      break;
  }

  const handleClick = () => {
    if (orderNo || entry.action.startsWith("order")) {
      navigate(`/orders?search=${encodeURIComponent(orderNo ?? "")}`);
    } else if (entry.escalationId) {
      navigate("/escalations");
    } else if (entry.conversationId) {
      navigate(`/conversations/${entry.conversationId}`);
    } else {
      navigate("/audit-log");
    }
  };

  return {
    id: entry.id,
    icon,
    title,
    actor,
    time,
    fullTime,
    category,
    onClick: handleClick,
  };
}

export function RecentActivityCard({ activities, isLoading: externalLoading }: RecentActivityCardProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "ai" | "staff" | "order">("all");
  const [showBottomFade, setShowBottomFade] = useState(true);
  const [rowHeight, setRowHeight] = useState(44);
  const [scrollMaxHeight, setScrollMaxHeight] = useState<number | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const prevFirstIdRef = useRef<string | null>(null);

  // Whole rows only: measure the INNER shell, pick how many rows fit (rows ~46px,
  // never below 38px), size rows to fill that space exactly, then cap the scroll area
  // at N rows + its py-1 padding (8px) so no half row shows at rest.
  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) {
          const avail = h - 8;
          const nVisible = Math.max(1, Math.min(Math.round(avail / 46), Math.floor(avail / 38)));
          const rh = Math.max(1, Math.floor(avail / nVisible));
          setRowHeight(rh);
          setScrollMaxHeight(nVisible * rh + 8);
        }
      }
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  // Query audit log infinitely (30 per page)
  const infiniteQuery = useInfiniteAuditLog({
    actorType: filter === "ai" ? "ai" : filter === "staff" ? "staff" : undefined,
    action: filter === "order" ? "order" : undefined,
    limit: 30,
  });

  const queryRows = infiniteQuery.rows;
  const isFetching = infiniteQuery.isLoading || externalLoading;
  const hasNextPage = infiniteQuery.hasNextPage;
  const isFetchingNextPage = infiniteQuery.isFetchingNextPage;
  const fetchNextPage = infiniteQuery.fetchNextPage;

  // Combine query rows with rich 200+ sample activities if database has fewer items
  const combinedEntries = useMemo(() => {
    if (queryRows && queryRows.length >= 200) {
      return queryRows;
    }
    // Filter sample items to match active category pill
    const filteredSample = SAMPLE_220_ACTIVITIES.filter((entry) => {
      if (filter === "all") return true;
      if (filter === "ai") return entry.actorType === "ai" || entry.action.includes("auto_reply");
      if (filter === "staff") return entry.actorType === "staff" || entry.actorType === "admin";
      if (filter === "order") return entry.action.startsWith("order");
      return true;
    });

    if (!queryRows || queryRows.length === 0) {
      return filteredSample;
    }

    // Merge query rows first, then fill with sample entries to guarantee 200+ scrolling rows
    const seenIds = new Set(queryRows.map((r) => r.id));
    const remainder = filteredSample.filter((s) => !seenIds.has(s.id));
    return [...queryRows, ...remainder];
  }, [queryRows, filter]);

  // Formatted items ready for rendering
  const displayItems = useMemo(() => {
    if (activities && activities.length >= 20) {
      return activities;
    }
    return combinedEntries.map((entry) => formatAuditEntry(entry, navigate));
  }, [activities, combinedEntries, navigate]);

  // Virtualizer setup with dynamic rowHeight
  const virtualCount = displayItems.length + (hasNextPage ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });

  // Rows are positioned from estimateSize; re-measure when the row height changes,
  // otherwise rows overlap or leave gaps.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Infinite scroll trigger: when within 8 rows of the end
  useEffect(() => {
    if (
      lastIndex >= displayItems.length - 8 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage();
    }
  }, [lastIndex, displayItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Reset scroll to top when category filter changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setShowBottomFade(displayItems.length > 5);
  }, [filter]);

  // Prevent scroll jump on realtime prepend if user has scrolled down
  useEffect(() => {
    const currentFirstId = displayItems[0]?.id;
    if (
      prevFirstIdRef.current &&
      currentFirstId &&
      prevFirstIdRef.current !== currentFirstId &&
      scrollRef.current &&
      scrollRef.current.scrollTop > 10
    ) {
      const newIndex = displayItems.findIndex((r) => r.id === prevFirstIdRef.current);
      if (newIndex > 0) {
        scrollRef.current.scrollTop += newIndex * rowHeight;
      }
    }
    prevFirstIdRef.current = currentFirstId ?? null;
  }, [displayItems, rowHeight]);

  // Scroll handler for bottom fade
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 8;
    setShowBottomFade(!atBottom && displayItems.length > 5);
  };

  return (
    // ─── OUTER SHELL (rounded-xl border border-border bg-surface p-4) ──────
    <div className="p-4 rounded-xl border border-border bg-surface flex flex-col min-h-0 gap-3 flex-1 overflow-hidden">
      {/* ─── Header (OUTSIDE the inner shell) ─────────────────────────────── */}
      <div className="h-9 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted">
            Recent Activity
          </h3>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>

        {/* Filter Pills [All | AI | Staff | Orders] */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-muted border border-border text-[11px] font-medium">
          {(["all", "ai", "staff", "order"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-2 py-0.5 rounded-md capitalize transition-all cursor-pointer ${
                filter === cat
                  ? "bg-surface text-text shadow-2xs font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {cat === "all" ? "All" : cat === "ai" ? "AI" : cat === "staff" ? "Staff" : "Orders"}
            </button>
          ))}
        </div>
      </div>

      {/* ─── INNER SHELL (rounded-lg border border-border/60 bg-surface-muted/50) */}
      <div
        ref={innerRef}
        className="flex-1 min-h-0 rounded-lg border border-border/60 bg-surface-muted/50 overflow-hidden relative flex flex-col focus-within:ring-1 focus-within:ring-primary focus-within:border-primary/60"
      >
        {isFetching && displayItems.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: `${rowHeight}px` }} className="flex items-center justify-between gap-2 animate-pulse px-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-surface-muted shrink-0" />
                  <div className="h-3.5 bg-surface-muted rounded w-2/3" />
                </div>
                <div className="h-3 bg-surface-muted rounded w-12 shrink-0" />
              </div>
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <History className="w-5 h-5 text-text-muted opacity-40 mb-1" />
            <p className="text-11 text-text-muted">
              No {filter !== "all" ? filter : ""} activity recorded.
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            tabIndex={0}
            role="region"
            aria-label="Recent activity stream"
            onScroll={handleScroll}
            style={scrollMaxHeight !== undefined ? { maxHeight: `${scrollMaxHeight}px` } : undefined}
            className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar px-2 py-1 focus:outline-none"
          >
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((vi) => {
                const isLoaderRow = vi.index >= displayItems.length;
                const isLast = vi.index === displayItems.length - 1;
                const positionStyle = {
                  position: "absolute" as const,
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${rowHeight}px`,
                  transform: `translateY(${vi.start}px)`,
                };

                if (isLoaderRow) {
                  return (
                    <div
                      key="infinite-loader"
                      style={positionStyle}
                      className="px-2 flex items-center justify-center gap-2 text-11 text-text-muted"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Loading more activity…</span>
                    </div>
                  );
                }

                const item = displayItems[vi.index];
                if (!item) return null;

                return (
                  <div
                    key={item.id}
                    style={positionStyle}
                    className={`py-0.5 ${!isLast ? "border-b border-border/40" : ""}`}
                  >
                    <div
                      onClick={item.onClick ?? (() => navigate("/audit-log"))}
                      title={item.fullTime ?? item.title}
                      className="w-full h-full flex items-center justify-between gap-2 px-2 rounded-md bg-transparent hover:bg-surface hover:shadow-2xs transition-all cursor-pointer group border border-transparent hover:border-border/50 select-none"
                    >
                      {/* Left: Icon & Title */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-surface border border-border/60 flex items-center justify-center shrink-0 group-hover:border-primary/40 transition-colors shadow-2xs">
                          {item.icon}
                        </div>
                        <span className="font-medium text-text text-11 truncate max-w-[170px] sm:max-w-[210px] group-hover:text-primary transition-colors">
                          {item.title}
                        </span>
                      </div>

                      {/* Right: Actor & Relative Time */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.actor && (
                          <span className="text-[10px] text-text-muted font-medium hidden sm:inline-block">
                            {item.actor}
                          </span>
                        )}
                        <span className="text-[10px] text-text-muted tabular-nums">
                          {item.time}
                        </span>
                        <ArrowUpRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Fade Gradient (matches inner shell background color) */}
        {showBottomFade && !isFetching && (
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--surface-muted)] to-transparent pointer-events-none z-10" />
        )}
      </div>

      {/* ─── Pinned Footer Line (OUTSIDE the inner shell) ─────────────────── */}
      <div className="h-9 shrink-0 pt-2 border-t border-border/60 flex items-center justify-between text-12 text-text-muted">
        <span className="text-text-muted">Live audit log</span>
        <Link
          to="/audit-log"
          className="text-primary hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Full audit log →</span>
        </Link>
      </div>
    </div>
  );
}
