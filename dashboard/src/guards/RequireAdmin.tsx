import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.ts";

/** UX only (the backend enforces roles). Staff are sent to their escalation queue. */
export function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/escalations" replace />;
  return <Outlet />;
}
