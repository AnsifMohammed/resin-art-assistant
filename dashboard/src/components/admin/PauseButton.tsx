import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { Spinner } from "../ui/Spinner.tsx";
import { ConfirmDialog } from "../ui/ConfirmDialog.tsx";

export interface PauseButtonProps {
  paused: boolean;
  /** Called with the requested new value (after confirmation when pausing). */
  onChange: (paused: boolean) => void;
  pending?: boolean;
  disabled?: boolean;
  /** Ask before pausing. Default true. Resuming never asks. */
  confirmPause?: boolean;
  className?: string;
}

/** Big prominent automation pause/resume toggle (admin only). */
export function PauseButton({
  paused,
  onChange,
  pending = false,
  disabled = false,
  confirmPause = true,
  className,
}: PauseButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const click = () => {
    if (paused) onChange(false);
    else if (confirmPause) setConfirming(true);
    else onChange(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={click}
        disabled={disabled || pending}
        aria-pressed={paused}
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors sm:p-5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          paused
            ? "border-red-200 bg-red-50 hover:bg-red-100"
            : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100",
          className,
        )}
      >
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-sm",
            paused ? "bg-red-600" : "bg-emerald-600",
          )}
          aria-hidden
        >
          {pending ? (
            <Spinner size="md" className="text-white" />
          ) : paused ? (
            <Play className="h-7 w-7" />
          ) : (
            <Pause className="h-7 w-7" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-lg font-semibold", paused ? "text-red-900" : "text-emerald-900")}>
            {paused ? "Automation is paused" : "Automation is on"}
          </span>
          <span className={cn("mt-0.5 block text-sm", paused ? "text-red-800" : "text-emerald-800")}>
            {paused
              ? "Messages are still stored, but the AI will not reply. Tap to resume."
              : "The AI answers routine questions and escalates the rest. Tap to pause."}
          </span>
        </span>
      </button>

      <ConfirmDialog
        open={confirming}
        title="Pause automation?"
        confirmLabel="Pause automation"
        variant="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onChange(true);
        }}
      >
        <div className="space-y-2 text-sm text-gray-600">
          <p>While paused, the AI will not reply to any customer on WhatsApp or Instagram.</p>
          <p>
            Incoming messages are <strong className="font-semibold text-gray-900">still stored</strong> and appear in
            the inbox, so you or your staff can reply by hand. Resume at any time.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
