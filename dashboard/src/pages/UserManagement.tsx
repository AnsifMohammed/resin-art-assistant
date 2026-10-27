import { useState } from "react";
import {
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  Wand2,
  Lock,
  Mail,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useUsers, useCreateUser, useUpdateUser } from "../hooks/useUsers.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { Avatar } from "../components/shared/Avatar.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { formatRelative } from "../lib/format.ts";
import { generatePassword } from "../lib/password.ts";
import { isApiError } from "../api/client.ts";
import type { StaffUser } from "../types/index.ts";

function calculatePasswordStrength(pass: string): {
  score: number; // 0 to 4
  label: string;
  colorClass: string;
} {
  if (!pass) return { score: 0, label: "None", colorClass: "bg-border" };
  let score = 0;
  if (pass.length >= 8) score += 1;
  if (pass.length >= 12) score += 1;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass) && /[^a-zA-Z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", colorClass: "bg-red-500" };
  if (score === 2) return { score: 2, label: "Fair", colorClass: "bg-amber-500" };
  if (score === 3) return { score: 3, label: "Good", colorClass: "bg-blue-500" };
  return { score: 4, label: "Strong", colorClass: "bg-emerald-500" };
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const ownerLabel = currentUser?.name || currentUser?.email || "";
  const usersQuery = useUsers();
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<StaffUser | null>(null);

  // Form states for Add Staff
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const passwordStrength = calculatePasswordStrength(password);

  const staffList = usersQuery.data ?? [];
  const sortedStaff = [...staffList].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
  );

  const handleToggleActive = (staff: StaffUser) => {
    if (staff.active) {
      // Deactivating requires confirmation
      setToDeactivate(staff);
    } else {
      // Reactivating needs no confirmation
      updateUserMutation.mutate(
        { id: staff.id, active: true },
        {
          onSuccess: () => {
            toast.success(`${staff.name} reactivated`, {
              description: "They can now log in to handle escalations.",
            });
          },
          onError: (err) => {
            toast.error("Couldn't reactivate account", {
              description: err.message,
            });
          },
        }
      );
    }
  };

  const confirmDeactivate = () => {
    if (!toDeactivate) return;
    const target = toDeactivate;
    updateUserMutation.mutate(
      { id: target.id, active: false },
      {
        onSuccess: () => {
          toast.success(`${target.name} deactivated`, {
            description: "They won't be able to sign in.",
          });
        },
        onError: (err) => {
          toast.error("Couldn't deactivate account", {
            description: err.message,
          });
        },
      }
    );
    setToDeactivate(null);
  };

  const handleOpenAddModal = () => {
    setName("");
    setEmail("");
    setPassword(generatePassword());
    setShowPassword(false);
    setFormError(null);
    setEmailError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEmailError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setFormError("Name is required");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }

    createUserMutation.mutate(
      { name: trimmedName, email: trimmedEmail, password },
      {
        onSuccess: (res) => {
          setIsAddModalOpen(false);
          toast.success(`${res.user.name} added`, {
            description: `Staff account created for ${res.user.email}.`,
          });
        },
        onError: (err) => {
          if (isApiError(err) && (err.status === 409 || err.code === "EMAIL_TAKEN")) {
            setEmailError("An account with this email already exists.");
          } else {
            setFormError(err.message || "Couldn't create the staff account.");
          }
        },
      }
    );
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-text tracking-tight flex items-center gap-2">
            <span>Users</span>
            {staffList.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-text">
                {staffList.length + 1} total
              </span>
            )}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            People who can sign in to the dashboard
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add staff</span>
        </button>
      </div>

      {/* ─── Pinned Admin Row ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-muted/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Administrator (Pinned)</span>
          </div>
          <span className="text-[11px] text-text-muted font-medium">Owner account</span>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface hover:bg-surface-muted/20 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={ownerLabel} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-text text-sm truncate">
                  {ownerLabel}
                </p>
                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-surface-muted text-text-muted border border-border shrink-0">
                  You
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  Admin
                </span>
              </div>
              {currentUser?.email && (
                <p className="text-sm text-text-muted truncate mt-0.5">{currentUser.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-text-muted shrink-0 sm:self-center">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-muted border border-border font-medium">
              <Lock className="w-3.5 h-3.5 text-text-muted" />
              <span>Full dashboard access</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── Staff Members Section ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-display text-text flex items-center gap-2">
            <span>Staff members</span>
            <span className="text-xs font-normal text-text-muted">
              ({staffList.filter((s) => s.active).length} active)
            </span>
          </h2>
          <span className="text-xs text-text-muted">
            Staff can view and reply to escalations only
          </span>
        </div>

        {usersQuery.isPending ? (
          /* Loading Skeletons */
          <div className="rounded-xl border border-border bg-surface p-4 divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface-muted" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-4 rounded bg-surface-muted" />
                    <div className="w-48 h-3 rounded bg-surface-muted" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-5 rounded-full bg-surface-muted" />
                  <div className="w-20 h-4 rounded bg-surface-muted" />
                  <div className="w-10 h-6 rounded-full bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : staffList.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 sm:p-10">
            <EmptyState
              title="No staff yet"
              description="Add your first helper to handle customer escalations during peak hours."
              action={{
                label: "Add staff",
                onClick: handleOpenAddModal,
              }}
            />
          </div>
        ) : (
          <>
            {/* Desktop DataTable (hidden on mobile) */}
            <div className="hidden md:block rounded-xl border border-border bg-surface shadow-xs overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted text-text-muted text-xs font-semibold uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3 text-right">Active Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedStaff.map((staff) => (
                    <tr
                      key={staff.id}
                      className="hover:bg-surface-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={staff.name} size="md" />
                          <span className="font-semibold text-text text-sm">
                            {staff.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-sm">
                        {staff.email}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                          Staff
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-sm tabular-nums">
                        {staff.lastLoginAt ? formatRelative(staff.lastLoginAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <span
                            className={`text-xs font-medium ${
                              staff.active ? "text-emerald-600 dark:text-emerald-400" : "text-text-muted"
                            }`}
                          >
                            {staff.active ? "Active" : "Deactivated"}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={staff.active}
                            onClick={() => handleToggleActive(staff)}
                            disabled={updateUserMutation.isPending && updateUserMutation.variables?.id === staff.id}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              staff.active ? "bg-primary" : "bg-border"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs ${
                                staff.active ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards (visible < md) */}
            <div className="md:hidden space-y-3">
              {sortedStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={staff.name} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-text text-sm truncate">{staff.name}</p>
                        <p className="text-xs text-text-muted truncate">{staff.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 shrink-0">
                      Staff
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-text-muted">
                    <div>
                      <span>Last login: </span>
                      <span className="font-medium text-text">
                        {staff.lastLoginAt ? formatRelative(staff.lastLoginAt) : "Never"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`font-medium ${
                          staff.active ? "text-emerald-600 dark:text-emerald-400" : "text-text-muted"
                        }`}
                      >
                        {staff.active ? "Active" : "Deactivated"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={staff.active}
                        onClick={() => handleToggleActive(staff)}
                        disabled={updateUserMutation.isPending && updateUserMutation.variables?.id === staff.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                          staff.active ? "bg-primary" : "bg-border"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            staff.active ? "translate-x-4.5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── Add Staff Dialog ────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-border space-y-5 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-text">Add staff member</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  They will be able to see and reply to escalated conversations only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inline General Form Error */}
            {formError && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-medium border border-red-500/20"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Senthil"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  placeholder="priya@asharesins.com"
                  className={`w-full px-3 py-2 text-sm rounded-lg bg-surface-muted border text-text focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${
                    emailError ? "border-red-500 focus:border-red-500" : "border-border focus:border-primary"
                  }`}
                />
                {emailError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{emailError}</p>
                )}
              </div>

              {/* Password with Generate button & Strength meter */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 pr-10 text-sm rounded-lg bg-surface-muted border border-border text-text font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface-muted text-text hover:bg-surface text-xs font-semibold cursor-pointer transition shrink-0"
                    title="Generate secure random password"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-primary" />
                    <span>Generate</span>
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password && (
                  <div className="pt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-text-muted">Password strength:</span>
                      <span className="font-semibold text-text">{passwordStrength.label}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`rounded-full transition-all ${
                            step <= passwordStrength.score ? passwordStrength.colorClass : "bg-border"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Informational Notice */}
              <div className="p-3 rounded-lg bg-surface-muted border border-border text-xs text-text-muted flex items-start gap-2">
                <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Share these credentials with your staff member. They will sign in at{" "}
                  <code className="text-text font-mono text-[11px]">/login</code> with the staff role.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border bg-surface text-text text-sm font-medium hover:bg-surface-muted cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                >
                  {createUserMutation.isPending ? "Creating..." : "Create staff account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Deactivate Confirmation Dialog ───────────────────────────────────── */}
      <ConfirmDialog
        isOpen={toDeactivate !== null}
        onClose={() => setToDeactivate(null)}
        onConfirm={confirmDeactivate}
        title={`Deactivate ${toDeactivate?.name}?`}
        description="They won't be able to sign in."
        confirmLabel="Deactivate"
        tone="danger"
      />
    </div>
  );
}
