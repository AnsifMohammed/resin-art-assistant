import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  AlertOctagon,
  ShoppingBag,
  MoreHorizontal,
  Users,
  Layers,
  Send,
  FileText,
  BookOpen,
  ClipboardList,
  UserCheck,
  Settings,
  X,
  LogOut,
} from "lucide-react";
import { InstagramIcon } from "../shared/InstagramIcon.tsx";
import { useAuth } from "../../context/AuthContext.tsx";
import { useEscalations } from "../../hooks/useEscalations.ts";

export function MobileBottomNav() {
  const { isAdmin, logout } = useAuth();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  // Same (shared) query as the sidebar badge and the bell.
  const escalations = useEscalations();
  const hasOpenEscalations = (escalations.data?.length ?? 0) > 0;

  const moreItems = [
    { to: "/customers", label: "Customers", icon: Users },
    { to: "/catalogue", label: "Catalogue", icon: Layers },
    { to: "/broadcast", label: "Broadcast", icon: Send },
    { to: "/templates", label: "Templates", icon: FileText },
    { to: "/ig-comments", label: "IG Comments", icon: InstagramIcon },
    { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
    { to: "/audit-log", label: "Audit Log", icon: ClipboardList },
    { to: "/users", label: "Users & Staff", icon: UserCheck },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border glass-panel pb-safe">
        <nav className="flex items-center justify-around h-14">
          {isAdmin ? (
            <>
              <NavLink
                to="/analytics"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[56px] h-full transition ${
                    isActive ? "text-primary-text font-semibold" : "text-text-muted hover:text-text"
                  }`
                }
              >
                <LayoutDashboard size={20} />
                <span className="text-[10px] mt-0.5">Analytics</span>
              </NavLink>

              <NavLink
                to="/inbox"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[56px] h-full transition ${
                    isActive ? "text-primary-text font-semibold" : "text-text-muted hover:text-text"
                  }`
                }
              >
                <Inbox size={20} />
                <span className="text-[10px] mt-0.5">Inbox</span>
              </NavLink>

              <NavLink
                to="/escalations"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[56px] h-full relative transition ${
                    isActive ? "text-primary-text font-semibold" : "text-text-muted hover:text-text"
                  }`
                }
              >
                <AlertOctagon size={20} />
                <span className="text-[10px] mt-0.5">Escalate</span>
                {hasOpenEscalations && <span className="absolute top-2 right-3 w-2 h-2 rounded-full bg-rose-500" />}
              </NavLink>

              <NavLink
                to="/orders"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[56px] h-full transition ${
                    isActive ? "text-primary-text font-semibold" : "text-text-muted hover:text-text"
                  }`
                }
              >
                <ShoppingBag size={20} />
                <span className="text-[10px] mt-0.5">Orders</span>
              </NavLink>

              <button
                type="button"
                onClick={() => setMoreSheetOpen(true)}
                className="flex flex-col items-center justify-center min-w-[56px] h-full text-text-muted hover:text-text transition"
              >
                <MoreHorizontal size={20} />
                <span className="text-[10px] mt-0.5">More</span>
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/escalations"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-w-[72px] h-full relative transition ${
                    isActive ? "text-primary-text font-semibold" : "text-text-muted hover:text-text"
                  }`
                }
              >
                <AlertOctagon size={22} />
                <span className="text-[11px] mt-1">Escalations</span>
                {hasOpenEscalations && <span className="absolute top-2 right-5 w-2 h-2 rounded-full bg-rose-500" />}
              </NavLink>

              <button
                type="button"
                onClick={() => void logout()}
                className="flex flex-col items-center justify-center min-w-[72px] h-full text-danger transition"
              >
                <LogOut size={22} />
                <span className="text-[11px] mt-1">Log out</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* More Bottom Sheet */}
      {moreSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs md:hidden animate-in fade-in duration-150">
          <div
            className="w-full saba-card rounded-t-2xl p-5 border-t border-border shadow-2xl max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="font-display font-semibold text-base text-text">All Navigation</span>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 py-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreSheetOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center p-3 rounded-xl text-center transition ${
                        isActive
                          ? "bg-primary-soft text-primary-text font-semibold"
                          : "bg-surface-muted text-text hover:bg-surface border border-border"
                      }`
                    }
                  >
                    <Icon size={22} className="mb-1.5" />
                    <span className="text-xs truncate w-full">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
