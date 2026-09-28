import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Mail, Wand2 } from "lucide-react";
import { isApiError } from "../../api/client.ts";
import { useCreateUser } from "../../hooks/useUsers.ts";
import type { StaffUser } from "../../types/index.ts";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { generatePassword } from "../../lib/password.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
interface Errors {
  name?: string;
  email?: string;
  password?: string;
  form?: string;
}

function validate(name: string, email: string, password: string): Errors {
  const e: Errors = {};
  if (!name.trim()) e.name = "Name is required.";
  if (!email.trim()) e.email = "Email is required.";
  else if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) e.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  return e;
}

/** Create a staff account (name, email, password). Role is always "staff" server-side. */
export function StaffForm({ onCreated, onCancel }: { onCreated: (user: StaffUser) => void; onCancel: () => void }) {
  const create = useCreateUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  // Re-validate as the user types after the first submit; server-side email errors persist until edited.
  const liveErrors: Errors = submitted ? validate(name, email, password) : {};
  const emailError = liveErrors.email ?? errors.email ?? null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const v = validate(name, email, password);
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setErrors({});
    create.mutate(
      { name: name.trim(), email: email.trim().toLowerCase(), password },
      {
        onSuccess: (res) => onCreated(res.user),
        onError: (err) => {
          if (isApiError(err) && (err.status === 409 || err.code === "EMAIL_TAKEN")) {
            setErrors({ email: "An account with this email already exists." });
          } else {
            setErrors({ form: err.message || "Couldn't create the account." });
          }
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
        error={liveErrors.name ?? null}
        required
      />
      <Input
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errors.email) setErrors(({ email: _removed, ...rest }) => rest);
        }}
        autoComplete="off"
        autoCapitalize="none"
        error={emailError}
        required
      />
      <div className="space-y-1.5">
        <div className="flex items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="pr-11 font-mono"
              required
              minLength={MIN_PASSWORD}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute bottom-0.5 right-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              setPassword(generatePassword());
              setShowPassword(true);
            }}
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            Generate
          </Button>
        </div>
        {liveErrors.password ? (
          <p className="text-sm text-red-600">{liveErrors.password}</p>
        ) : (
          <p className="text-sm text-gray-500">At least {MIN_PASSWORD} characters.</p>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        A welcome email with the login link, email and this password is sent to the staff member. They can see
        escalated conversations only.
      </p>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errors.form}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Create staff account
        </Button>
      </div>
    </form>
  );
}
