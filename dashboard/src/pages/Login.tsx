import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { isApiError } from "../api/client.ts";
import { Button } from "../components/ui/Button.tsx";
import { Input } from "../components/ui/Input.tsx";
import { canVisit, roleHome } from "../guards/roleHome.ts";
import { useAuth } from "../hooks/useAuth.ts";
import type { Role } from "../types/index.ts";

function loginErrorMessage(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong. Please try again.";
  if (err.isRateLimited) {
    if (err.retryAfterSeconds && err.retryAfterSeconds > 0) {
      const minutes = Math.max(1, Math.ceil(err.retryAfterSeconds / 60));
      return `Too many attempts, try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return "Too many attempts, try again in a few minutes.";
  }
  if (err.isNetworkError || err.status === 502 || err.status === 503 || err.status === 504) return "Can't reach the server. Check your connection and try again.";
  if (err.status === 401) return "Incorrect email or password.";
  if (err.status === 403) return err.message || "This account has been deactivated.";
  if (err.status === 400) return "Enter a valid email and password.";
  return err.message || "Something went wrong. Please try again.";
}

function destinationFor(role: Role, from: Location | undefined): string {
  if (from && canVisit(role, from.pathname)) return `${from.pathname}${from.search}${from.hash}`;
  return roleHome(role);
}

export default function Login() {
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Resin Art Assistant";
  }, []);

  if (status === "authenticated" && user) return <Navigate to={destinationFor(user.role, from)} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email, password);
      navigate(destinationFor(signedIn.role, from), { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-4 h-14 w-14 rounded-2xl shadow-sm" />
          <h1 className="text-xl font-semibold text-gray-900">Resin Art Assistant</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to manage customer messages</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" noValidate>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" size="lg" block loading={submitting} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
