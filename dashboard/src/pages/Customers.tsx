import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Star,
  MessageSquare,
  LayoutGrid,
  Table as TableIcon,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import {
  mockCustomers,
  type Customer,
} from "../data/mockData.ts";

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [activeTab, setActiveTab] = useState<"all" | "favourites" | "priority" | "recent" | "new">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"spend" | "orders" | "recent">("spend");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [showBanner, setShowBanner] = useState(true);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const toggleFavourite = (customerId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === customerId) {
          const next = !c.isFavourite;
          toast.success(next ? "Marked as favourite" : "Removed from favourites", {
            description: c.name,
          });
          return { ...c, isFavourite: next };
        }
        return c;
      })
    );
  };

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        if (activeTab === "favourites" && !c.isFavourite) return false;
        if (activeTab === "priority" && !c.isPriority) return false;
        if (activeTab === "recent" && !c.isRecentOrder) return false;
        if (activeTab === "new" && !c.isNew) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            c.handleOrPhone.toLowerCase().includes(q) ||
            c.city.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "spend") return b.totalSpend - a.totalSpend;
        if (sortBy === "orders") return b.ordersCount - a.ordersCount;
        return 0;
      });
  }, [customers, activeTab, searchQuery, sortBy]);

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Customer Directory</span>
            <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
              {customers.length} contacts
            </span>
            <SampleDataBadge title="Customer profiles using static sample contacts" />
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Buyer segments, lifetime spend, notes, and conversation shortcuts
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Card grid"
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

      {/* ─── Dismissible Info Banner (Prompt 4) ─────────────────────────────────── */}
      {showBanner && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-13 text-text">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Priority Routing:</strong> Returning and priority customers are processed first by the AI messaging assistant during busy periods.
            </span>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="p-1 rounded-lg hover:bg-primary/20 text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Segment Tabs & Search Bar ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              activeTab === "all"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            All ({customers.length})
          </button>
          <button
            onClick={() => setActiveTab("favourites")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              activeTab === "favourites"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            Favourites ({customers.filter((c) => c.isFavourite).length})
          </button>
          <button
            onClick={() => setActiveTab("priority")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              activeTab === "priority"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            Priority ({customers.filter((c) => c.isPriority).length})
          </button>
          <button
            onClick={() => setActiveTab("recent")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              activeTab === "recent"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            Recent Orders ({customers.filter((c) => c.isRecentOrder).length})
          </button>
          <button
            onClick={() => setActiveTab("new")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              activeTab === "new"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            New ({customers.filter((c) => c.isNew).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-60">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer focus:outline-none"
          >
            <option value="spend">Sort by Spend</option>
            <option value="orders">Sort by Orders</option>
            <option value="recent">Sort by Recent</option>
          </select>
        </div>
      </div>

      {/* ─── Grid View ────────────────────────────────────────────────────────── */}
      {filteredCustomers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-border bg-surface text-text-muted">
          No customers found matching this criteria.
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCustomer(c)}
              className="p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-16 font-outfit text-primary-text">
                      {c.name[0]}
                    </div>
                    <div>
                      <h3 className="text-15 font-bold font-outfit text-text">{c.name}</h3>
                      <div className="flex items-center gap-1.5 text-11 text-text-muted">
                        <ChannelIcon channel={c.channel} size={12} />
                        <span>{c.handleOrPhone}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => toggleFavourite(c.id, e)}
                    className="p-1 rounded-md hover:bg-surface-muted text-text-muted transition-colors cursor-pointer"
                  >
                    <Star
                      className={`w-4 h-4 transition-transform active:scale-125 ${
                        c.isFavourite ? "text-amber-500 fill-amber-500" : "text-border hover:text-amber-400"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.isPriority && (
                    <span className="px-2 py-0.5 rounded text-10 font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                      Priority
                    </span>
                  )}
                  {c.isRecentOrder && (
                    <span className="px-2 py-0.5 rounded text-10 font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Recent Buyer
                    </span>
                  )}
                  {c.isNew && (
                    <span className="px-2 py-0.5 rounded text-10 font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      New Contact
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded text-10 font-medium bg-surface-muted text-text-muted border border-border/60">
                    {c.city}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg border border-border/40 bg-surface-muted text-center text-12">
                  <div>
                    <span className="text-11 text-text-muted block">Spend</span>
                    <strong className="text-text tabular-nums font-outfit text-14">
                      ₹{c.totalSpend.toLocaleString("en-IN")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-11 text-text-muted block">Orders</span>
                    <strong className="text-text tabular-nums font-outfit text-14">
                      {c.ordersCount}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12">
                <span className="text-11 text-text-muted">Active: {c.lastActive}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/inbox");
                  }}
                  className="px-2.5 py-1 rounded-md bg-primary/10 text-primary-text font-semibold hover:bg-primary/20 transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Open chat</span>
                </button>
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
                <th className="p-3.5">City</th>
                <th className="p-3.5">Total Spend</th>
                <th className="p-3.5">Orders</th>
                <th className="p-3.5">Last Active</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredCustomers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <td className="p-3.5 font-bold font-outfit text-text flex items-center gap-2">
                    <Star
                      onClick={(e) => toggleFavourite(c.id, e)}
                      className={`w-3.5 h-3.5 cursor-pointer ${
                        c.isFavourite ? "text-amber-500 fill-amber-500" : "text-border"
                      }`}
                    />
                    <span>{c.name}</span>
                  </td>
                  <td className="p-3.5">
                    <ChannelIcon channel={c.channel} size={14} />
                  </td>
                  <td className="p-3.5 text-text-muted">{c.city}</td>
                  <td className="p-3.5 font-bold font-outfit text-text tabular-nums">
                    ₹{c.totalSpend.toLocaleString("en-IN")}
                  </td>
                  <td className="p-3.5 tabular-nums text-text font-medium">{c.ordersCount}</td>
                  <td className="p-3.5 text-text-muted">{c.lastActive}</td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/inbox");
                      }}
                      className="px-2.5 py-1 rounded-md bg-primary/10 text-primary-text font-semibold hover:bg-primary/20 text-11 cursor-pointer"
                    >
                      Chat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Customer SlideOver ───────────────────────────────────────────────── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-6 custom-scrollbar animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-18 font-bold font-outfit text-text">Customer Profile</h3>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center p-4 rounded-xl border border-border bg-surface-muted">
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary mx-auto flex items-center justify-center font-bold text-24 font-outfit text-primary-text mb-2">
                {selectedCustomer.name[0]}
              </div>
              <h4 className="text-18 font-bold font-outfit text-text">{selectedCustomer.name}</h4>
              <div className="flex items-center justify-center gap-1.5 text-12 text-text-muted mt-0.5">
                <ChannelIcon channel={selectedCustomer.channel} size={13} />
                <span>{selectedCustomer.handleOrPhone}</span>
              </div>
              <p className="text-12 text-text-muted mt-1">{selectedCustomer.city}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-lg border border-border bg-surface-muted">
                <p className="text-11 text-text-muted font-medium">Lifetime Spend</p>
                <p className="text-18 font-bold font-outfit text-text mt-0.5 tabular-nums">
                  ₹{selectedCustomer.totalSpend.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-surface-muted">
                <p className="text-11 text-text-muted font-medium">Completed Orders</p>
                <p className="text-18 font-bold font-outfit text-text mt-0.5 tabular-nums">
                  {selectedCustomer.ordersCount}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
                Studio Notes
              </p>
              <textarea
                rows={3}
                defaultValue={selectedCustomer.notes || "Prefers WhatsApp voice notes for custom sizing."}
                onChange={() => toast.success("Notes saved")}
                className="w-full p-2.5 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              onClick={() => navigate("/inbox")}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Open Conversation in Inbox</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
