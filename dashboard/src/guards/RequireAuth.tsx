import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useAuth } from "../hooks/useAuth.ts";

/** Redirects to /login (remembering the target) unless signed in. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") {
    return (
      <div className="h-dvh">
        <PageSpinner label="Restoring session" />
      </div>
    );
  }
  if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
