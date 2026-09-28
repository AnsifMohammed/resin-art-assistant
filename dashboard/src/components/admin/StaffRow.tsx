import { cn } from "../../lib/cn.ts";
import { formatDateTime, formatRelative } from "../../lib/format.ts";
import type { StaffUser } from "../../types/index.ts";
import { Badge, RoleBadge } from "../ui/Badge.tsx";
import { Switch } from "../ui/Switch.tsx";

/**
 * One staff member. Renders as a card on phones and a grid row from md up
 * (columns match the header in UserManagement).
 */
export function StaffRow({
  user,
  onToggleActive,
  pending = false,
}: {
  user: StaffUser;
  /** Parent decides whether to confirm (deactivate) before mutating. */
  onToggleActive: (user: StaffUser, next: boolean) => void;
  pending?: boolean;
}) {
  const lastLogin = user.lastLoginAt ?? null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_minmax(0,1.2fr)_auto] md:gap-4",
        !user.active && "bg-gray-50",
      )}
    >
      <div className="min-w-0 flex-1 md:contents">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate font-medium", user.active ? "text-gray-900" : "text-gray-500")}>
            {user.name}
          </span>
          {!user.active && <Badge className="md:hidden">Inactive</Badge>}
        </div>
        <p className="truncate text-sm text-gray-500 md:text-gray-700">{user.email}</p>
        <div className="mt-1 flex items-center gap-2 md:mt-0 md:contents">
          <RoleBadge role={user.role ?? "staff"} />
          <span
            className="truncate text-xs text-gray-500 md:text-sm"
            title={lastLogin ? formatDateTime(lastLogin) : undefined}
          >
            <span className="md:hidden">Last login </span>
            {lastLogin ? formatRelative(lastLogin) : "Never logged in"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 md:justify-end">
        <span className="hidden text-sm text-gray-500 lg:inline">{user.active ? "Active" : "Inactive"}</span>
        <Switch
          checked={user.active}
          disabled={pending}
          onChange={(next) => onToggleActive(user, next)}
          label={`${user.active ? "Deactivate" : "Reactivate"} ${user.name}`}
        />
      </div>
    </li>
  );
}
