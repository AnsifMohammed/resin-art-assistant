import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { Eye, EyeOff, Sparkles, User, Shield, AlertCircle, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { isApiError } from "../api/client.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { useTheme } from "../context/ThemeContext.tsx";
import { canVisit, roleHome } from "../guards/roleHome.ts";
import type { Role } from "../types/index.ts";

interface DemoAccount {
  role: Role;
  label: string;
  email: string;
  password: string;
}

/**
 * Seeded demo accounts (backend seed). Only offered as a prefill in development builds;
 * the ternary lets production builds drop the credentials from the bundle entirely.
 */
const DEMO_ACCOUNTS: DemoAccount[] = import.meta.env.DEV
  ? [
      { role: "admin", label: "Demo admin", email: "asha@asharesins.com", password: "changeme123" },
      { role: "staff", label: "Demo staff", email: "priya@asharesins.com", password: "staffpass123" },
    ]
  : [];

function loginErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  if (err.status === 401) return "Invalid email or password";
  if (err.status === 403) return "Account deactivated";
  if (err.status === 429) return "Too many attempts — try again in a few minutes";
  // Network failure, or the dev proxy answering for an unreachable backend (no JSON error body).
  if (
    err.isNetworkError ||
    (err.status >= 502 && err.status <= 504) ||
    (err.status >= 500 && err.code.startsWith("HTTP_"))
  ) {
    return "Can't reach the server";
  }
  if (err.status === 400) return "Enter a valid email and password";
  return err.message || "Something went wrong. Please try again.";
}

function destinationFor(role: Role, from: Location | undefined): string {
  if (from && canVisit(role, from.pathname)) return `${from.pathname}${from.search}${from.hash}`;
  return roleHome(role);
}

export default function Login() {
  const { status, user, login } = useAuth();
  const { toggleTheme, resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Saba Art Assistant";
  }, []);

  if (status === "authenticated" && user) {
    return <Navigate to={destinationFor(user.role, from)} replace />;
  }

  function triggerShake(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 300);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      triggerShake("Enter your email and password to sign in.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Role comes only from the backend response (and the JWT it signs).
      const signedIn = await login(email, password);
      toast.success(
        `Signed in as ${signedIn.name} (${signedIn.role === "admin" ? "Admin" : "Staff"})`
      );
      navigate(destinationFor(signedIn.role, from), { replace: true });
    } catch (err) {
      setLoading(false);
      triggerShake(loginErrorMessage(err));
    }
  }

  function prefill(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <div className="relative min-h-dvh flex items-center justify-center p-4 overflow-hidden bg-bg text-text">
      {/* ─── Full-screen Backdrop Image of Resin Art ───────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        <img
          src="/login-backdrop.jpg"
          alt="Resin art backdrop"
          className="w-full h-full object-cover select-none"
        />
        {/* Soft overlay: warm white ~70% in light theme, deep navy ~75% in dark theme */}
        <div className="absolute inset-0 bg-[#FAFAF9]/70 dark:bg-[#0B1120]/75 backdrop-blur-[2px] transition-colors duration-200" />
      </div>

      {/* Subtle radial amber glow for brand warmth */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(245, 158, 11, 0.22) 0%, rgba(245, 158, 11, 0.05) 50%, transparent 70%)",
        }}
      />

      {/* Top Bar Floating Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-xl border border-border bg-surface/80 dark:bg-surface/80 backdrop-blur-md hover:bg-surface-muted transition shadow-sm text-text-muted hover:text-text cursor-pointer"
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? (
            <Sun size={18} className="text-amber-400" />
          ) : (
            <Moon size={18} className="text-stone-700" />
          )}
        </button>
      </div>

      {/* ─── Floating Glass Login Card ────────────────────────────────────── */}
      <div
        className={`relative z-10 w-full max-w-sm backdrop-blur-md bg-surface/90 dark:bg-surface/85 p-7 sm:p-8 border border-border shadow-2xl rounded-2xl transition-all duration-200 ${
          shake ? "animate-shake ring-2 ring-red-500" : ""
        }`}
      >
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center text-center mb-6">
          {/* Amber Resin Drop Mark */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 mb-3.5 transform hover:rotate-6 transition duration-200">
            <Sparkles size={28} className="fill-white/20" />
          </div>

          <h1 className="font-display font-bold text-2xl tracking-tight text-text">Saba Art</h1>
          <p className="text-xs text-text-muted mt-1">
            AI Assistant & Messaging Dashboard · Coimbatore
          </p>
        </div>

        {/* Inline Error Notice */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-medium border border-red-500/20 animate-in fade-in"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Floating Label Email Input */}
          <div className="relative">
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              className="peer w-full px-3.5 pt-5 pb-2 rounded-xl text-sm bg-surface-muted/80 border border-border text-text placeholder-transparent focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 transition"
            />
            <label
              htmlFor="email"
              className="absolute left-3.5 top-2 text-[11px] font-semibold text-text-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-normal peer-focus:top-2 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-primary-text"
            >
              Email address
            </label>
          </div>

          {/* Floating Label Password Input */}
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=" "
              className="peer w-full px-3.5 pt-5 pb-2 pr-10 rounded-xl text-sm bg-surface-muted/80 border border-border text-text placeholder-transparent focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 transition"
            />
            <label
              htmlFor="password"
              className="absolute left-3.5 top-2 text-[11px] font-semibold text-text-muted transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-normal peer-focus:top-2 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-primary-text"
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3.5 text-text-muted hover:text-text transition p-0.5 cursor-pointer"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Submit Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:brightness-105 active:scale-[0.98] transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>

        {/* Development only: prefill the seeded accounts (still a real login) */}
        {import.meta.env.DEV && DEMO_ACCOUNTS.length > 0 && (
          <div className="mt-6 pt-5 border-t border-border">
            <p className="text-[11px] font-semibold text-center text-text-muted uppercase tracking-wider mb-2.5">
              Demo login (dev only)
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => prefill(account)}
                  title={`Fill in ${account.email}`}
                  className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-semibold border transition active:scale-[0.98] cursor-pointer ${
                    account.role === "admin"
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/15"
                      : "bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/20 hover:bg-purple-500/15"
                  }`}
                >
                  {account.role === "admin" ? (
                    <Shield size={12} className="text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <User size={12} className="text-purple-600 dark:text-purple-400" />
                  )}
                  <span>{account.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] text-center text-text-muted">
              Fills in the seeded credentials. You still sign in with the real backend.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
