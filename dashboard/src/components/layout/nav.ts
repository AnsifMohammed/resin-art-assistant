import {
  BookOpen,
  ClipboardList,
  Inbox,
  BarChart3,
  Settings,
  ShieldAlert,
  Users,
  ShoppingBag,
  Layers,
  Send,
  FileText,
  MessageCircle,
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
  { to: "/orders", label: "Orders", icon: ShoppingBag, primary: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/catalogue", label: "Catalogue", icon: Layers },
  { to: "/broadcast", label: "Broadcast", icon: Send },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/ig-comments", label: "IG Comments", icon: MessageCircle },
  { to: "/knowledge-base", label: "Knowledge base", icon: BookOpen },
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
