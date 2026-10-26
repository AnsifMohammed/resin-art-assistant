import { useEffect, useState } from "react";
import { AlertCircle, Users } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { Modal } from "../ui/Modal.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useAssignEscalation } from "../../hooks/useEscalations.ts";
import { useUsers } from "../../hooks/useUsers.ts";
import { cn } from "../../lib/cn.ts";
import { customerLabel } from "../../lib/format.ts";
import type { EscalationListItem } from "../../types/index.ts";

const UNASSIGNED = "__unassigned__";

/** Admin only: pick an active staff member (or "Unassigned") for an escalation. */
export function AssignModal({
  escalation,
  onClose,
}: {
  /** null = closed */
  escalation: EscalationListItem | null;
  onClose: () => void;
}) {
  const open = escalation !== null;
  const users = useUsers({ enabled: open });
  const assign = useAssignEscalation();
  const { toast } = useToast();
  const [choice, setChoice] = useState<string>(UNASSIGNED);

  useEffect(() => {
    if (escalation) setChoice(escalation.assignedToUserId ?? UNASSIGNED);
  }, [escalation]);

  const activeStaff = (users.data ?? []).filter((u) => u.active);
  const current = escalation?.assignedToUserId ?? UNASSIGNED;

  const submit = () => {
    if (!escalation) return;
    const userId = choice === UNASSIGNED ? null : choice;
    assign.mutate(
      { escalationId: escalation.id, userId },
      {
        onSuccess: (res) => {
          toast({
            variant: "success",
            title: res.escalation.assignedTo ? `Assigned to ${res.escalation.assignedTo.name}` : "Moved to the shared queue",
          });
          onClose();
        },
        onError: (err) => toast({ variant: "error", title: "Couldn't assign", description: err.message }),
      },
    );
  };

  const options = [
    { id: UNASSIGNED, name: "Unassigned", detail: "Any staff member can pick it up" },
    ...activeStaff.map((u) => ({ id: u.id, name: u.name, detail: u.email })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign escalation"
      {...(escalation ? { description: `Customer: ${customerLabel(escalation.conversation.customer)}` } : {})}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={choice === current || users.isPending}>
            Assign
          </Button>
        </>
      }
    >
      {users.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading staff" />
        </div>
      ) : users.isError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h4 className="text-14 font-semibold text-text">Couldn't load staff</h4>
          <p className="text-12 text-text-muted">{users.error.message}</p>
          <div className="pt-1">
            <Button variant="outline" onClick={() => void users.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <fieldset>
          <legend className="sr-only">Assign to</legend>
          <div className="space-y-2">
            {options.map((o) => (
              <label
                key={o.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500",
                  choice === o.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:bg-gray-50",
                )}
              >
                <input
                  type="radio"
                  name="assignee"
                  value={o.id}
                  checked={choice === o.id}
                  onChange={() => setChoice(o.id)}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {o.name}
                    {o.id === current && <span className="ml-1 font-normal text-gray-400">(current)</span>}
                  </span>
                  <span className="block truncate text-xs text-gray-500">{o.detail}</span>
                </span>
              </label>
            ))}
          </div>
          {activeStaff.length === 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <Users className="h-4 w-4" aria-hidden />
              No active staff yet. Add staff under Users.
            </p>
          )}
        </fieldset>
      )}
    </Modal>
  );
}
