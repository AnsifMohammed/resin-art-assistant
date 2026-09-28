import { useState } from "react";
import { AlertTriangle, RefreshCw, UserPlus, Users } from "lucide-react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { StaffForm } from "../components/admin/StaffForm.tsx";
import { StaffRow } from "../components/admin/StaffRow.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { Modal } from "../components/ui/Modal.tsx";
import { PageSpinner } from "../components/ui/Spinner.tsx";
import { useToast } from "../components/ui/Toast.tsx";
import { useUpdateUser, useUsers } from "../hooks/useUsers.ts";
import type { StaffUser } from "../types/index.ts";

export default function UserManagement() {
  usePageTitle("Users");
  const users = useUsers();
  const update = useUpdateUser();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<StaffUser | null>(null);

  const setActive = (user: StaffUser, active: boolean) =>
    update.mutate(
      { id: user.id, active },
      {
        onSuccess: () =>
          toast({
            variant: "success",
            title: active ? `${user.name} reactivated` : `${user.name} deactivated`,
            ...(active ? {} : { description: "They can no longer log in." }),
          }),
        onError: (err) => toast({ variant: "error", title: "Couldn't update account", description: err.message }),
      },
    );

  const onToggle = (user: StaffUser, next: boolean) => {
    if (next) setActive(user, true);
    else setToDeactivate(user);
  };

  const list = users.data ?? [];
  const sorted = [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const activeCount = list.filter((u) => u.active).length;

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <UserPlus className="h-4 w-4" aria-hidden />
      Add staff
    </Button>
  );

  let body;
  if (users.isPending) body = <PageSpinner label="Loading staff" />;
  else if (users.isError)
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load staff"
        description={users.error.message}
        action={
          <Button variant="outline" onClick={() => void users.refetch()} loading={users.isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        }
      />
    );
  else if (list.length === 0)
    body = (
      <EmptyState
        icon={Users}
        title="No staff yet"
        description="Add a helper so they can handle escalated conversations. Staff only see escalations, nothing else."
        action={addButton}
      />
    );
  else
    body = (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="hidden border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_minmax(0,1.2fr)_auto] md:gap-4"
          aria-hidden
        >
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Last login</span>
          <span className="text-right">Active</span>
        </div>
        <ul className="divide-y divide-gray-100" aria-label="Staff accounts">
          {sorted.map((u) => (
            <StaffRow
              key={u.id}
              user={u}
              onToggleActive={onToggle}
              pending={update.isPending && update.variables?.id === u.id}
            />
          ))}
        </ul>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Staff accounts</h2>
          <p className="text-sm text-gray-500">
            {users.data ? `${activeCount} active of ${list.length}` : "Helpers who handle escalations"}
          </p>
        </div>
        {list.length > 0 && addButton}
      </div>

      {body}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add staff member"
        description="They'll be able to see and reply to escalated conversations only."
      >
        {adding && (
          <StaffForm
            onCancel={() => setAdding(false)}
            onCreated={(user) => {
              setAdding(false);
              toast({ variant: "success", title: `${user.name} added`, description: `Welcome email sent to ${user.email}.` });
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={toDeactivate !== null}
        title={`Deactivate ${toDeactivate?.name ?? "staff member"}?`}
        confirmLabel="Deactivate"
        variant="danger"
        onCancel={() => setToDeactivate(null)}
        onConfirm={() => {
          if (toDeactivate) setActive(toDeactivate, false);
          setToDeactivate(null);
        }}
      >
        <p className="text-sm text-gray-600">
          They won't be able to log in. Any escalations assigned to them stay assigned until you reassign them. You
          can reactivate the account later.
        </p>
      </ConfirmDialog>
    </div>
  );
}
