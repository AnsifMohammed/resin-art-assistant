import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn.ts";
import type { NavItem } from "./nav.ts";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-gray-900">Resin Art</p>
        <p className="text-xs text-gray-500">Assistant</p>
      </div>
    </div>
  );
}

/** Desktop (md+) vertical sidebar. */
export function SidebarNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <Brand className="h-16 px-5" />
      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-emerald-50 text-emerald-800" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("h-5 w-5", isActive ? "text-emerald-600" : "text-gray-400")} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {footer && <div className="border-t border-gray-200 p-3">{footer}</div>}
    </aside>
  );
}
