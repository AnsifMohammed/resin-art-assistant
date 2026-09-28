import { staffNav } from "./nav.ts";
import { SidebarNav } from "./SidebarNav.tsx";

/** Escalations only. */
export function StaffSidebar() {
  return <SidebarNav items={staffNav} />;
}
