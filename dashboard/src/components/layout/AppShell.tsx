import { Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.ts";
import { AdminSidebar } from "./AdminSidebar.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { adminNav, staffNav } from "./nav.ts";
import { PageTitleProvider } from "./PageTitle.tsx";
import { StaffSidebar } from "./StaffSidebar.tsx";
import { TopBar } from "./TopBar.tsx";

/**
 * Authenticated layout. Picks the sidebar by role; on phones the sidebar becomes a
 * bottom tab bar (admin) or disappears (staff has a single destination).
 */
export function AppShell() {
  const { isAdmin } = useAuth();
  return (
    <PageTitleProvider>
      <div className="flex h-dvh overflow-hidden bg-gray-50">
        {isAdmin ? <AdminSidebar /> : <StaffSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className={isAdmin ? "flex-1 overflow-y-auto pb-20 md:pb-0" : "flex-1 overflow-y-auto"}>
            <Outlet />
          </main>
        </div>
        <BottomNav items={isAdmin ? adminNav : staffNav} />
      </div>
    </PageTitleProvider>
  );
}
