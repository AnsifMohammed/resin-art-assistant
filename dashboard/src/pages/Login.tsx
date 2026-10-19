import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { Eye, EyeOff, AlertCircle, Sun, Moon, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { isApiError } from "../api/client.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { useTheme } from "../context/ThemeContext.tsx";
import { canVisit, roleHome } from "../guards/roleHome.ts";
import type { Role } from "../types/index.ts";
import { ResinSpinner } from "../components/shared/Loaders.tsx";

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

/**
 * Amber resin drop logo mark with ocean-teal wave at the bottom and gloss highlight.
 */
function ResinDropMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="amber-drop-grad" x1="17" y1="2" x2="17" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBBF24" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="teal-wave-grad" x1="4" y1="23" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
        <clipPath id="drop-shape-clip">
          <path d="M17 2.5C17 2.5 5.5 16.5 5.5 22.8C5.5 28.5 10.5 32 17 32C23.5 32 28.5 28.5 28.5 22.8C28.5 16.5 17 2.5 17 2.5Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#drop-shape-clip)">
        {/* Main Amber Resin Body */}
        <rect width="34" height="34" fill="url(#amber-drop-grad)" />
        {/* Teal Wave At Bottom */}
        <path
          d="M4 23.5C8.5 21.5 13 25 17.5 23.5C22 22 26 25 30.5 23V34H4V23.5Z"
          fill="url(#teal-wave-grad)"
        />
        {/* Curved Glossy Highlight */}
        <ellipse
          cx="13"
          cy="12.5"
          rx="2.8"
          ry="6"
          transform="rotate(-28 13 12.5)"
          fill="white"
          fillOpacity="0.32"
        />
      </g>
    </svg>
  );
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
  const [imageLoaded, setImageLoaded] = useState(false);

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
    <div className="min-h-dvh flex flex-col md:flex-row w-full bg-white dark:bg-[#111827] text-stone-900 dark:text-[#F1F5F9] transition-colors duration-200">
      {/* ─── LEFT HALF (Art Panel) ─────────────────────────────────────────
          Desktop (≥1024px): 55% wide, full screen height
          Tablet (768–1023px): 45% wide, full screen height
          Phone (<768px): 300px header at the top
      ──────────────────────────────────────────────────────────────────── */}
      <section
        className="relative w-full h-[300px] md:h-auto md:w-[45%] lg:w-[55%] md:min-h-dvh shrink-0 overflow-hidden bg-stone-900 select-none"
        aria-label="Saba Art showcase"
      >
        <img
          src="/login-backdrop.jpg"
          alt="Amber, gold and teal resin pour"
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${
            imageLoaded ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Dark gradient overlay over bottom half: transparent at 45% -> rgba(12,10,9,0.7) at bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(12, 10, 9, 0.7) 100%)",
          }}
        />

        {/* Bottom-left text block: 48px from edges on desktop/tablet, 24px on phone */}
        <div className="absolute bottom-0 left-0 p-6 md:p-12 text-white pointer-events-none">
          {/* Small caps label */}
          <p className="text-[13px] font-semibold tracking-[0.08em] uppercase text-white/95">
            HANDMADE RESIN ART · COIMBATORE
          </p>

          {/* Headline (hidden on phone <768px, 28px on tablet, 34px on desktop) */}
          <h2 className="hidden md:block mt-2.5 text-[28px] lg:text-[34px] font-semibold leading-[1.2] max-w-[520px] text-white font-['Outfit',sans-serif]">
            Every piece poured by hand. Every customer answered on time.
          </h2>
        </div>
      </section>

      {/* ─── RIGHT HALF (Form Panel) ────────────────────────────────────────
          Desktop/Tablet: centered content, max-width 380px, gap 28px
          Phone: slides up over photo (-mt-6, rounded-t-[24px], p-7 24px)
      ──────────────────────────────────────────────────────────────────── */}
      <section
        className="relative flex-1 flex flex-col justify-center items-center px-6 pt-7 pb-8 -mt-6 rounded-t-[24px] md:mt-0 md:rounded-none md:p-12 lg:p-16 bg-white dark:bg-[#111827] shadow-xl md:shadow-none min-h-[calc(100dvh-276px)] md:min-h-dvh z-10"
        aria-label="Sign in form"
      >
        {/* Floating Theme Toggle in top-right corner */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-20">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-[rgba(255,255,255,0.08)] bg-stone-50 dark:bg-[#1A2335] hover:bg-stone-100 dark:hover:bg-[#222e44] text-stone-600 dark:text-[#94A3B8] transition cursor-pointer"
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

        {/* Content Centered Container (max-width 380px, vertical gap 28px) */}
        <div className="w-full max-w-[380px] mx-auto flex flex-col gap-7">
          {/* 1. Logo Row */}
          <div
            className="flex items-center gap-2.5 animate-rise-fade"
            style={{ animationDelay: "0ms" }}
          >
            <ResinDropMark />
            <span className="font-['Outfit',sans-serif] text-[22px] font-bold tracking-tight text-stone-900 dark:text-[#F1F5F9]">
              Saba Art
            </span>
          </div>

          {/* 2. Header Title & Subtitle */}
          <div className="animate-rise-fade" style={{ animationDelay: "40ms" }}>
            <h1 className="font-['Outfit',sans-serif] text-[32px] font-semibold text-stone-900 dark:text-[#F1F5F9] tracking-tight leading-tight">
              Welcome back
            </h1>
            <p className="text-[15px] text-stone-500 dark:text-[#94A3B8] mt-1.5 leading-normal">
              Sign in to answer customers and manage your shop.
            </p>
          </div>

          {/* 3. Form */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 animate-rise-fade"
            style={{ animationDelay: "80ms" }}
            noValidate
          >
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-[13px] font-medium text-stone-700 dark:text-[#F1F5F9] mb-1.5"
              >
                Email address
              </label>
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
                placeholder="name@asharesins.com"
                className="w-full h-[48px] md:h-[46px] px-3.5 rounded-[8px] text-[16px] md:text-[14px] bg-stone-50 dark:bg-[#1A2335] border border-stone-200 dark:border-[rgba(255,255,255,0.08)] text-stone-900 dark:text-[#F1F5F9] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-[#F59E0B] transition"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-[13px] font-medium text-stone-700 dark:text-[#F1F5F9] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-[48px] md:h-[46px] pl-3.5 pr-12 rounded-[8px] text-[16px] md:text-[14px] bg-stone-50 dark:bg-[#1A2335] border border-stone-200 dark:border-[rgba(255,255,255,0.08)] text-stone-900 dark:text-[#F1F5F9] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-[#F59E0B] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-11 h-11 flex items-center justify-center absolute right-0.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Inline Error Notice */}
            {error && (
              <div
                role="alert"
                className={`flex items-center gap-2 p-2.5 rounded-[8px] bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[13px] font-medium ${
                  shake ? "animate-shake" : ""
                }`}
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* "Sign in" Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] md:h-[48px] rounded-[8px] bg-[#F59E0B] hover:bg-[#E58E00] active:scale-[0.99] text-[#111827] font-semibold text-[15px] shadow-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <>
                  <ResinSpinner size="sm" tone="current" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>

          {/* 4. Under Form Helper Note */}
          <div className="animate-rise-fade" style={{ animationDelay: "120ms" }}>
            <p className="text-[13px] text-stone-500 dark:text-[#94A3B8] text-center leading-relaxed">
              Owner and helpers use the same sign-in. Forgot your password? Ask the shop owner to reset it.
            </p>
          </div>

          {/* 5. Development Only Demo Chips */}
          {import.meta.env.DEV && DEMO_ACCOUNTS.length > 0 && (
            <div
              className="pt-4 border-t border-stone-200 dark:border-[rgba(255,255,255,0.08)] animate-rise-fade"
              style={{ animationDelay: "160ms" }}
            >
              <p className="text-[11px] font-semibold text-center text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">
                Demo quick fill (dev only)
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => prefill(account)}
                    title={`Fill in ${account.email}`}
                    className={`inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-[12px] font-medium border transition active:scale-[0.98] cursor-pointer ${
                      account.role === "admin"
                        ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/15"
                        : "bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/25 hover:bg-purple-500/15"
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
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
