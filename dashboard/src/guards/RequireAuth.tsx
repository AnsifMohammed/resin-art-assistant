import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../api/client.ts";
import { AppFrameSkeleton } from "../components/layout/AppFrameSkeleton.tsx";
import { useAuth } from "../hooks/useAuth.ts";

/** Redirects to /login (remembering the target) unless signed in. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    const hasToken = Boolean(getToken());
    if (hasToken) {
      return <AppFrameSkeleton />;
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
