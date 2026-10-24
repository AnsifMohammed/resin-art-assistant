import { useEffect, useState, type ComponentType } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  AlertOctagon,
  ShoppingBag,
  Users,
  Layers,
  Send,
  FileText,
  BookOpen,
  ClipboardList,
  UserCheck,
  Settings,
  Sun,
  Moon,
  PauseCircle,
  PlayCircle,
  Search,
} from "lucide-react";
import { InstagramIcon } from "../shared/InstagramIcon.tsx";
import { ChannelIcon } from "../shared/ChannelIcon.tsx";

import { useAuth } from "../../context/AuthContext.tsx";
import { useTheme } from "../../context/ThemeContext.tsx";
import { useConversations } from "../../hooks/useConversations.ts";
import { customerLabel, humanize } from "../../lib/format.ts";
import { useOrders } from "../../hooks/useOrders.ts";
import type { AutomationControl } from "./AppShell.tsx";

interface CommandPaletteProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  automation: AutomationControl;
}

interface NavCommand {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  adminOnly: boolean;
}

const NAV_COMMANDS: NavCommand[] = [
  { to: "/analytics", label: "Analytics Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/inbox", label: "Inbox", icon: Inbox, adminOnly: true },
  { to: "/escalations", label: "Escalations Queue", icon: AlertOctagon, adminOnly: false },
  { to: "/orders", label: "Orders", icon: ShoppingBag, adminOnly: true },
  { to: "/customers", label: "Customers", icon: Users, adminOnly: true },
  { to: "/catalogue", label: "Product Catalogue", icon: Layers, adminOnly: true },
  { to: "/broadcast", label: "Broadcast Messages", icon: Send, adminOnly: true },
  { to: "/templates", label: "Templates", icon: FileText, adminOnly: true },
  { to: "/ig-comments", label: "Instagram Comments", icon: InstagramIcon, adminOnly: true },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen, adminOnly: true },
  { to: "/audit-log", label: "Audit Log", icon: ClipboardList, adminOnly: true },
  { to: "/users", label: "Staff & Users", icon: UserCheck, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const ITEM_CLASS =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text cursor-pointer hover:bg-surface-muted aria-selected:bg-primary-soft aria-selected:text-primary-text transition";
const ROW_CLASS =
  "flex items-center justify-between px-3 py-2 rounded-lg text-sm text-text cursor-pointer hover:bg-surface-muted aria-selected:bg-primary-soft aria-selected:text-primary-text transition";

/** Most recent conversations searched client-side (GET /conversations has no text search; max page size is 100). */
const CONVERSATION_SEARCH_LIMIT = 100;

export function CommandPalette({ open, setOpen, automation }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toggleTheme, resolvedTheme } = useTheme();
  const [search, setSearch] = useState("");

  // Admin only (the endpoints are 403 for staff), and only while the palette is open.
  const conversations = useConversations({ limit: CONVERSATION_SEARCH_LIMIT }, { enabled: isAdmin && open });
  const ordersQuery = useOrders(undefined, { enabled: isAdmin && open });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  if (!open) return null;

  function runCommand(action: () => void) {
    action();
    setOpen(false);
  }

  const navCommands = NAV_COMMANDS.filter((c) => isAdmin || !c.adminOnly);
  const conversationRows = conversations.data?.conversations ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl rounded-2xl saba-card border border-border shadow-2xl overflow-hidden glass-panel">
        <Command
          className="w-full flex flex-col"
          shouldFilter={true}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="flex items-center px-4 border-b border-border">
            <Search size={18} className="text-text-muted shrink-0 mr-3" />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder={isAdmin ? "Type a command, page or customer..." : "Type a command or page..."}
              className="w-full py-4 text-sm bg-transparent text-text placeholder:text-text-muted outline-hidden"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono font-medium text-text-muted bg-surface-muted px-2 py-0.5 rounded border border-border">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-6 text-center text-sm text-text-muted">
              No results found for "{search}".
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group heading="Actions" className="text-xs font-semibold text-text-muted px-2 py-1">
              {isAdmin && automation.paused !== undefined && (
                <Command.Item
                  value={automation.paused ? "Resume AI Automation" : "Pause AI Automation"}
                  onSelect={() => runCommand(automation.requestToggle)}
                  className={ITEM_CLASS}
                >
                  {automation.paused ? (
                    <PlayCircle size={16} className="text-emerald-500" />
                  ) : (
                    <PauseCircle size={16} className="text-rose-500" />
                  )}
                  <span>{automation.paused ? "Resume AI Automation" : "Pause AI Automation"}</span>
                </Command.Item>
              )}

              <Command.Item onSelect={() => runCommand(toggleTheme)} className={ITEM_CLASS}>
                {resolvedTheme === "dark" ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-blue-500" />}
                <span>Toggle Theme ({resolvedTheme === "dark" ? "Light" : "Dark"})</span>
              </Command.Item>
            </Command.Group>

            {/* Navigation Pages */}
            <Command.Group heading="Navigation" className="text-xs font-semibold text-text-muted px-2 py-1 mt-2">
              {navCommands.map((c) => {
                const Icon = c.icon;
                return (
                  <Command.Item key={c.to} value={c.label} onSelect={() => runCommand(() => navigate(c.to))} className={ITEM_CLASS}>
                    <Icon size={16} />
                    <span>{c.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Customers: real conversations (admin only) */}
            {isAdmin && (
              <Command.Group heading="Customers" className="text-xs font-semibold text-text-muted px-2 py-1 mt-2">
                {conversations.isPending ? (
                  <Command.Loading>
                    <p className="px-3 py-2 text-xs text-text-muted">Loading conversations…</p>
                  </Command.Loading>
                ) : (
                  conversationRows.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`${customerLabel(c.customer)} ${c.customer.handleOrPhone} ${c.id}`}
                      keywords={[c.channelType, c.state]}
                      onSelect={() => runCommand(() => navigate(`/inbox?c=${encodeURIComponent(c.id)}`))}
                      className={ROW_CLASS}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChannelIcon channel={c.channelType} size={14} />
                        <span className="font-medium truncate">{customerLabel(c.customer)}</span>
                        {c.customer.name && (
                          <span className="text-xs text-text-muted truncate">({c.customer.handleOrPhone})</span>
                        )}
                      </div>
                      <span className="text-xs text-text-muted shrink-0">{humanize(c.state)}</span>
                    </Command.Item>
                  ))
                )}
              </Command.Group>
            )}

            {/* Real Orders */}
            {isAdmin && (
              <Command.Group heading="Recent Orders" className="text-xs font-semibold text-text-muted px-2 py-1 mt-2">
                {(ordersQuery.data?.orders || []).slice(0, 4).map((o) => (
                  <Command.Item
                    key={o.id}
                    value={`${o.orderNo} ${o.customerName}`}
                    onSelect={() => runCommand(() => navigate("/orders"))}
                    className={ROW_CLASS}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">#{o.orderNo}</span>
                      <span className="text-xs text-text-muted">{o.customerName}</span>
                    </div>
                    <span className="text-xs font-medium">₹{Number(o.totalAmount).toLocaleString("en-IN")}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
