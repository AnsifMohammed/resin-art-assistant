import { Navigate, Route, Routes } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AppShell } from "./components/layout/AppShell.tsx";
import { RequireAdmin } from "./guards/RequireAdmin.tsx";
import { RequireAuth } from "./guards/RequireAuth.tsx";
import { roleHome } from "./guards/roleHome.ts";
import { useAuth } from "./hooks/useAuth.ts";
import { usePushNotifications } from "./hooks/usePushNotifications.ts";
import Login from "./pages/Login.tsx";
import Analytics from "./pages/Analytics.tsx";
import Inbox from "./pages/Inbox.tsx";
import Escalations from "./pages/Escalations.tsx";
import Orders from "./pages/Orders.tsx";
import Customers from "./pages/Customers.tsx";
import Catalogue from "./pages/Catalogue.tsx";
import Broadcast from "./pages/Broadcast.tsx";
import Templates from "./pages/Templates.tsx";
import IGComments from "./pages/IGComments.tsx";
import KnowledgeBase from "./pages/KnowledgeBase.tsx";
import AuditLog from "./pages/AuditLog.tsx";
import UserManagement from "./pages/UserManagement.tsx";
import Settings from "./pages/Settings.tsx";
import StaffChat from "./pages/StaffChat.tsx";

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

/** "/" → role landing page (admin → /inbox, staff → /escalations), from the backend user. */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={roleHome(user?.role)} replace />;
}

function ErrorFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
      <h2 className="text-lg font-bold">Something went wrong</h2>
      <p className="text-sm text-text-muted">A client error occurred during rendering.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-105"
      >
        Reload Page
      </button>
    </div>
  );
}

export default function App() {
  // Silently (re)registers push for the signed-in user if permission was already granted.
  usePushNotifications();

  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <SentryRoutes>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            {/* Admin-only routes */}
            <Route element={<RequireAdmin />}>
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/catalogue" element={<Catalogue />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/ig-comments" element={<IGComments />} />
              <Route path="/knowledge-base" element={<KnowledgeBase />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Staff + Admin routes */}
            <Route path="/escalations" element={<Escalations />} />
            <Route path="/conversations/:id" element={<StaffChat />} />

            <Route path="/" element={<RoleHome />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </SentryRoutes>
    </Sentry.ErrorBoundary>
  );
}
