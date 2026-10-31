import { useState, type ComponentType } from "react";
import { NavLink } from "react-router-dom";
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
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import { InstagramIcon } from "../shared/InstagramIcon.tsx";
import { SabaLogo } from "../shared/SabaLogo.tsx";
import { useAuth } from "../../context/AuthContext.tsx";
import { useEscalations } from "../../hooks/useEscalations.ts";
import { Avatar } from "../shared/Avatar.tsx";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Live count shown as a badge (only "escalations" has a backend today). */
  badgeKey?: "escalations";
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    name: "Overview",
    items: [
      { to: "/analytics", label: "Analytics", icon: LayoutDashboard },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/escalations", label: "Escalations", icon: AlertOctagon, badgeKey: "escalations" },
    ],
  },
  {
    name: "Commerce",
    items: [
      { to: "/orders", label: "Orders", icon: ShoppingBag },
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/catalogue", label: "Catalogue", icon: Layers },
    ],
  },
  {
    name: "Engage",
    items: [
      { to: "/broadcast", label: "Broadcast", icon: Send },
      { to: "/templates", label: "Templates", icon: FileText },
      { to: "/ig-comments", label: "IG Comments", icon: InstagramIcon },
    ],
  },
  {
    name: "Manage",
    items: [
      { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
      { to: "/audit-log", label: "Audit Log", icon: ClipboardList },
      { to: "/users", label: "Users", icon: UserCheck },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const STAFF_NAV_GROUPS: NavGroup[] = [
  {
    name: "Workspace",
    items: [
      { to: "/escalations", label: "Escalations Queue", icon: AlertOctagon, badgeKey: "escalations" },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = "saba_sidebar_collapsed";

export function Sidebar() {
  const { user, role, isAdmin, logout } = useAuth();
  // Open escalations (server-scoped: all for admin, own + unassigned for staff). Shared query with the bell.
  const escalations = useEscalations();
  const openEscalations = escalations.data?.length ?? 0;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const isTablet = window.innerWidth < 1024;
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved !== null) return saved === "true";
      return isTablet;
    }
    return false;
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const groups = isAdmin ? ADMIN_NAV_GROUPS : STAFF_NAV_GROUPS;

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-border bg-surface shrink-0 transition-all duration-200 select-none z-30 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand Header */}
      <div
        className={`h-14 flex items-center border-b border-border transition-all ${
          collapsed ? "justify-center px-2" : "justify-between px-3.5"
        }`}
      >
        {!collapsed ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Saba 4-Tile Logo Mark */}
              <SabaLogo className="w-7 h-7 rounded-sm" />
              <div className="flex flex-col min-w-0">
                <span className="font-display font-bold text-sm tracking-tight text-text truncate">
                  Saba Art
                </span>
                <span className="text-[10px] text-text-muted truncate">Coimbatore</span>
              </div>
            </div>

            {/* Collapse toggle button */}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition shrink-0 cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="group relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-surface-muted transition cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            {/* Saba 4-Tile Logo Mark */}
            <SabaLogo className="w-7 h-7 rounded-sm group-hover:scale-105 transition-transform" />

            {/* Expand indicator icon overlay badge */}
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted group-hover:text-primary transition-colors shadow-2xs">
              <PanelLeftOpen size={10} />
            </span>

            {/* Floating tooltip on collapsed rail */}
            <span className="absolute left-full ml-2 px-2 py-1 rounded bg-stone-900 text-white text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition z-50 shadow-md font-normal">
              Expand sidebar
            </span>
          </button>
        )}
      </div>

      {/* Nav items list */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map((group) => (
          <div key={group.name} className="space-y-0.5">
            {!collapsed && (
              <h2 className="px-2.5 pb-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                {group.name}
              </h2>
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const badge = item.badgeKey === "escalations" && openEscalations > 0 ? openEscalations : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary-soft text-primary-text font-semibold shadow-2xs"
                        : "text-text-muted hover:text-text hover:bg-surface-muted"
                    } ${collapsed ? "justify-center px-0" : ""}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                      )}

                      <Icon
                        size={17}
                        className={`shrink-0 ${
                          isActive
                            ? "text-primary-text"
                            : "text-text-muted group-hover:text-text"
                        }`}
                      />

                      {!collapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}

                      {!collapsed && typeof badge === "number" && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-soft text-primary-text border border-primary/20">
                          {badge}
                        </span>
                      )}

                      {collapsed && typeof badge === "number" && (
                        <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500" aria-hidden />
                      )}

                      {/* Tooltip on collapsed rail */}
                      {collapsed && (
                        <span className="absolute left-full ml-2 px-2 py-1 rounded bg-stone-900 text-white text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition z-50 shadow-md">
                          {item.label}
                          {typeof badge === "number" && ` (${badge})`}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Profile / Logout */}
      <div className="p-2 border-t border-border">
        {!collapsed ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-surface-muted/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={user?.name ?? "?"} size="sm" />
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-semibold text-text truncate">
                  {user?.name}
                </span>
                <span className="text-[10px] text-text-muted capitalize">
                  {role}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="p-1 rounded text-text-muted hover:text-danger hover:bg-rose-500/10 transition"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <Avatar name={user?.name ?? "?"} size="sm" />
            <button
              type="button"
              onClick={() => void logout()}
              className="p-1.5 rounded text-text-muted hover:text-danger hover:bg-rose-500/10 transition"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
