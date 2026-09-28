import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import * as authApi from "../api/auth.ts";
import { clearToken, getToken, isApiError, setToken, setUnauthorizedHandler } from "../api/client.ts";
import type { AuthUser, JwtPayload, Role } from "../types/index.ts";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  role: Role | null;
  isAdmin: boolean;
  /** Throws ApiError on failure (401 invalid credentials, 403 deactivated, 429 rate limited). */
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Service-worker runtime cache for API GETs (see vite.config.ts). */
const API_CACHE_NAME = "api-cache";

/** Decode (not verify) the JWT payload. Only used as an offline fallback when /auth/me is unreachable. */
function decodeToken(token: string): AuthUser | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Partial<JwtPayload> & { exp?: number };
    if (!payload.sub || !payload.role || !payload.businessId || !payload.name) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { id: payload.sub, name: payload.name, role: payload.role, businessId: payload.businessId };
  } catch {
    return null;
  }
}

/** Remove per-user state that could leak to the next person on a shared phone. */
async function purgeDeviceState(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if ("caches" in window) {
    tasks.push(caches.delete(API_CACHE_NAME).catch(() => false));
  }
  // Stop escalation pushes for the previous user on this device. The endpoint becomes
  // invalid, so the backend receives 410 on the next send and deletes the row.
  if ("serviceWorker" in navigator) {
    tasks.push(
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager?.getSubscription())
        .then((sub) => sub?.unsubscribe())
        .catch(() => undefined),
    );
  }
  await Promise.all(tasks);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? "loading" : "anonymous"));

  // Latest location for the 401 handler without re-registering it each navigation.
  const locationRef = useRef(location);
  locationRef.current = location;

  const clearSession = useCallback(() => {
    clearToken();
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
    Sentry.setUser(null);
  }, [queryClient]);

  // Global 401 → drop the session and send the user to /login (remembering where they were).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      void purgeDeviceState();
      const loc = locationRef.current;
      if (loc.pathname !== "/login") {
        navigate("/login", { replace: true, state: { from: loc } });
      }
    });
  }, [clearSession, navigate]);

  // On load with a token, restore the session from GET /auth/me.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then(({ user: me }) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiError(err) && (err.isNetworkError || err.status >= 500)) {
          // Offline / server down: trust the unexpired token locally; the server still enforces access.
          const decoded = decodeToken(token);
          if (decoded) {
            setUser(decoded);
            setStatus("authenticated");
            return;
          }
        }
        // 401 is already handled globally; anything else also ends the session.
        clearSession();
      });
    return () => controller.abort();
  }, [clearSession]);

  useEffect(() => {
    if (user) Sentry.setUser({ id: user.id, role: user.role } as Sentry.User);
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email: email.trim().toLowerCase(), password });
      // Fresh start: nothing from a previous session may be shown to this user.
      queryClient.clear();
      await purgeDeviceState();
      setToken(res.token);
      setUser(res.user);
      setStatus("authenticated");
      return res.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Stateless server-side; best effort, never block logout on it.
    await authApi.logout().catch(() => undefined);
    clearSession();
    await purgeDeviceState();
    navigate("/login", { replace: true });
  }, [clearSession, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      isAdmin: user?.role === "admin",
      login,
      logout,
    }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
