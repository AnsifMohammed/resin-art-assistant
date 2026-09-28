import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import type { NavItem } from "./nav.ts";

const tabClass = (active: boolean) =>
  cn(
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
    active ? "text-emerald-700" : "text-gray-500",
  );

/**
 * Phone navigation (< md): primary items as tabs, the rest in a "More" sheet.
 * Renders nothing when there is a single destination (staff).
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMoreOpen(false), [location.pathname]);

  if (items.length <= 1) return null;
  const primary = items.filter((i) => i.primary);
  const secondary = items.filter((i) => !i.primary);
  const secondaryActive = secondary.some((i) => location.pathname.startsWith(i.to));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-gray-900/30" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-safe shadow-xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-sm font-semibold text-gray-900">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="-m-1 rounded-md p-1 text-gray-400"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="px-3 pb-4" aria-label="More">
              {secondary.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium",
                      isActive ? "bg-emerald-50 text-emerald-800" : "text-gray-700 active:bg-gray-100",
                    )
                  }
                >
                  <Icon className="h-5 w-5 text-gray-400" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white/95 pb-safe backdrop-blur md:hidden"
        aria-label="Main"
      >
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
            <Icon className="h-6 w-6" aria-hidden />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
        {secondary.length > 0 && (
          <button
            type="button"
            className={tabClass(secondaryActive || moreOpen)}
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="h-6 w-6" aria-hidden />
            <span>More</span>
          </button>
        )}
      </nav>
    </>
  );
}
