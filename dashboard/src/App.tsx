import { Navigate, Route, Routes } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AppShell } from "./components/layout/AppShell.tsx";
import { RequireAdmin } from "./guards/RequireAdmin.tsx";
import { RequireAuth } from "./guards/RequireAuth.tsx";
import { roleHome } from "./guards/roleHome.ts";
import { useAuth } from "./hooks/useAuth.ts";
import { usePushNotifications } from "./hooks/usePushNotifications.ts";
import AdminEscalations from "./pages/AdminEscalations.tsx";
import AdminInbox from "./pages/AdminInbox.tsx";
import Analytics from "./pages/Analytics.tsx";
import AuditLog from "./pages/AuditLog.tsx";
import KnowledgeBase from "./pages/KnowledgeBase.tsx";
import Login from "./pages/Login.tsx";
import Settings from "./pages/Settings.tsx";
import StaffChat from "./pages/StaffChat.tsx";
import StaffEscalations from "./pages/StaffEscalations.tsx";
import UserManagement from "./pages/UserManagement.tsx";

// Parameterised transaction names (e.g. /conversations/:id) for Sentry tracing.
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

/** "/" → role landing page. */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={roleHome(user?.role)} replace />;
}

/** /escalations → full queue for admin, own + unassigned for staff. */
function EscalationsRoute() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminEscalations /> : <StaffEscalations />;
}

function ErrorFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <p className="text-base font-medium text-gray-900">Something went wrong. The team has been notified.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Reload
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
            {/* Admin-only */}
            <Route element={<RequireAdmin />}>
              <Route path="/inbox" element={<AdminInbox />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/knowledge-base" element={<KnowledgeBase />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Staff + admin */}
            <Route path="/escalations" element={<EscalationsRoute />} />
            <Route path="/conversations/:id" element={<StaffChat />} />

            <Route path="/" element={<RoleHome />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </SentryRoutes>
    </Sentry.ErrorBoundary>
  );
}
