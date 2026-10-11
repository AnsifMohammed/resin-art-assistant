import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  UserCheck,
  UserPlus,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext.tsx";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import {
  mockConversations,
  mockUsers,
  type Conversation,
} from "../data/mockData.ts";

export default function Escalations() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    mockConversations.filter((c) => c.state === "escalated" || c.escalationReason)
  );

  const [filterType, setFilterType] = useState<"all" | "unassigned" | "mine">("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Simulated escalation arriving shortly after page opens (as specified in Prompt 3)
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming: Conversation = {
        id: `conv-sim-${Date.now()}`,
        customerId: "cust-sim",
        customerName: "Kavitha Rajan",
        customerHandle: "+91 94421 88910",
        channel: "whatsapp",
        state: "escalated",
        escalationReason: "Urgent shipping inquiry",
        lastMessage: "Hi Asha, I urgently need the resin tray delivered by tomorrow morning for a housewarming!",
        lastMessageTime: "Just now",
        unread: true,
        isPriority: true,
        isFavourite: false,
        windowClosesAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        messages: [
          {
            id: `msg-${Date.now()}`,
            sender: "customer",
            text: "Hi Asha, I urgently need the resin tray delivered by tomorrow morning for a housewarming!",
            timestamp: "Just now",
          },
        ],
      };

      setConversations((prev) => [incoming, ...prev]);
      toast.warning("New escalation received", {
        description: "Kavitha Rajan · Urgent shipping inquiry",
        action: {
          label: "View",
          onClick: () => navigate(`/inbox?c=${incoming.id}`),
        },
      });
    }, 4500);

    return () => clearTimeout(timer);
  }, [navigate]);

  // Scope filter: If staff, only unassigned or assigned to them
  const scopedConversations = useMemo(() => {
    let list = conversations;
    if (!isAdmin) {
      list = list.filter(
        (c) => !c.assignedTo || c.assignedTo === user?.name || c.assignedTo === "Unassigned"
      );
    }
    return list;
  }, [conversations, isAdmin, user?.name]);

  // Apply filters
  const filteredEscalations = useMemo(() => {
    return scopedConversations.filter((c) => {
      if (filterType === "unassigned" && c.assignedTo && c.assignedTo !== "Unassigned") return false;
      if (filterType === "mine" && c.assignedTo !== (user?.name || "Asha")) return false;
      if (reasonFilter !== "all" && c.escalationReason !== reasonFilter) return false;
      return true;
    });
  }, [scopedConversations, filterType, reasonFilter, user?.name]);

  // Header stats
  const totalOpen = scopedConversations.length;
  const unassignedCount = scopedConversations.filter(
    (c) => !c.assignedTo || c.assignedTo === "Unassigned"
  ).length;

  const handleAssign = (convId: string, staffName: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, assignedTo: staffName } : c))
    );
    setAssigningId(null);
    toast.success(`Escalation assigned to ${staffName}`);
  };

  const handleResolve = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    toast.success("Escalation resolved", {
      description: "Customer handed back to AI assistant",
    });
  };

  const getWaitTimeBadge = (time: string) => {
    if (time.includes("1h") || time.includes("2h")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-bold bg-red-500/15 text-red-600 dark:text-red-400">
          <Clock className="w-3 h-3" /> Waiting {time}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <Clock className="w-3 h-3" /> Waiting {time}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Header & Top Stats ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Escalation Queue</span>
            {totalOpen > 0 && (
              <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-red-500 text-white">
                {totalOpen} open
              </span>
            )}
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Customer inquiries requiring human review, custom pricing, or approvals
          </p>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "cards" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Cards view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "table" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Table view"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Metric Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Open Escalations</p>
            <p className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums">
              {totalOpen}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-500/10 text-red-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Unassigned</p>
            <p className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums">
              {unassignedCount}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
            <UserPlus className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Avg Wait Time</p>
            <p className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums">
              18m 40s
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-teal/10 text-teal">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── Filters Bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-1.5 text-12 font-medium">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filterType === "all"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            All ({scopedConversations.length})
          </button>
          <button
            onClick={() => setFilterType("unassigned")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filterType === "unassigned"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            Unassigned ({unassignedCount})
          </button>
          <button
            onClick={() => setFilterType("mine")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filterType === "mine"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            Assigned to me
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-12 text-text-muted font-medium">Reason:</span>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="all">All Reasons</option>
            <option value="Custom resin inquiry">Custom resin inquiry</option>
            <option value="Urgent shipping inquiry">Urgent shipping inquiry</option>
            <option value="Bulk order discount">Bulk order discount</option>
            <option value="Refund request">Refund request</option>
          </select>
        </div>
      </div>

      {/* ─── Content: Cards vs Table ─────────────────────────────────────────── */}
      {filteredEscalations.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-border bg-surface space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-16 font-bold font-outfit text-text">All caught up!</h3>
          <p className="text-13 text-text-muted max-w-sm mx-auto">
            There are no pending escalations waiting for human handling right now.
          </p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEscalations.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/inbox?c=${c.id}`)}
              className="p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-14 font-outfit text-primary-text">
                      {c.customerName[0]}
                    </div>
                    <div>
                      <h4 className="text-14 font-bold font-outfit text-text">{c.customerName}</h4>
                      <div className="flex items-center gap-1.5 text-11 text-text-muted">
                        <ChannelIcon channel={c.channel} size={11} />
                        <span>{c.customerHandle}</span>
                      </div>
                    </div>
                  </div>
                  {getWaitTimeBadge(c.lastMessageTime)}
                </div>

                {/* Reason Badge */}
                <div className="mb-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-11 font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    {c.escalationReason || "General inquiry"}
                  </span>
                </div>

                {/* Last Message Excerpt */}
                <p className="text-12 text-text-muted line-clamp-3 bg-surface-muted p-2.5 rounded-lg border border-border/40 italic">
                  "{c.lastMessage}"
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12">
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningId(assigningId === c.id ? null : c.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-muted hover:bg-surface border border-border/70 text-text text-11 font-medium transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3 h-3 text-primary" />
                    <span>{c.assignedTo || "Unassigned"}</span>
                  </button>

                  {/* Assign Staff Popover */}
                  {assigningId === c.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 bottom-full mb-2 w-48 rounded-xl border border-border bg-surface p-2 shadow-xl z-20 space-y-1.5 animate-in fade-in"
                    >
                      <p className="text-11 font-semibold text-text px-1">Assign to staff:</p>
                      <div className="max-h-36 overflow-y-auto space-y-0.5 custom-scrollbar">
                        {mockUsers.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAssign(c.id, u.name)}
                            className="w-full text-left px-2 py-1 rounded-md hover:bg-surface-muted text-12 text-text flex items-center justify-between cursor-pointer"
                          >
                            <span>{u.name}</span>
                            <span className="text-10 text-text-muted capitalize">{u.role}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleResolve(c.id, e)}
                    className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-11 font-semibold transition-colors cursor-pointer"
                  >
                    Resolve
                  </button>

                  <span className="text-primary font-semibold inline-flex items-center gap-0.5 text-12">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-left text-13">
            <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
              <tr>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Channel</th>
                <th className="p-3.5">Reason</th>
                <th className="p-3.5">Excerpt</th>
                <th className="p-3.5">Waiting Time</th>
                <th className="p-3.5">Assignee</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredEscalations.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/inbox?c=${c.id}`)}
                  className="hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <td className="p-3.5 font-semibold text-text">{c.customerName}</td>
                  <td className="p-3.5">
                    <ChannelIcon channel={c.channel} size={14} />
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-11 font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                      {c.escalationReason}
                    </span>
                  </td>
                  <td className="p-3.5 text-text-muted max-w-xs truncate">
                    "{c.lastMessage}"
                  </td>
                  <td className="p-3.5">{getWaitTimeBadge(c.lastMessageTime)}</td>
                  <td className="p-3.5">
                    <span className="text-12 font-medium text-text">
                      {c.assignedTo || "Unassigned"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => handleResolve(c.id, e)}
                      className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-11 font-semibold transition-colors cursor-pointer"
                    >
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
