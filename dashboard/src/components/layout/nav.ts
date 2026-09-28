import {
  BookOpen,
  ClipboardList,
  Inbox,
  BarChart3,
  Settings,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest go under "More". */
  primary?: boolean;
}

export const adminNav: NavItem[] = [
  { to: "/inbox", label: "Inbox", icon: Inbox, primary: true },
  { to: "/escalations", label: "Escalations", icon: ShieldAlert, primary: true },
  { to: "/knowledge-base", label: "Knowledge base", icon: BookOpen, primary: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/audit-log", label: "Audit log", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const staffNav: NavItem[] = [{ to: "/escalations", label: "Escalations", icon: ShieldAlert, primary: true }];

/** Fallback page title from the current path. */
export function titleForPath(pathname: string): string {
  if (pathname.startsWith("/conversations/")) return "Conversation";
  const item = adminNav.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return item?.label ?? "Resin Art";
}
