import { adminNav } from "./nav.ts";
import { SidebarNav } from "./SidebarNav.tsx";

/** Inbox, Escalations, Knowledge base, Analytics, Users, Audit log, Settings. */
export function AdminSidebar() {
  return <SidebarNav items={adminNav} />;
}
