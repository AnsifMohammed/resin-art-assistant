import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn.ts";

const NOTES_MAX = 2000;

/**
 * Notes textarea that saves on blur or via the Save button (never per keystroke).
 * Resets to the server value whenever it changes and the field is not dirty.
 */
export function CustomerNotesField({
  value,
  onSave,
  saving = false,
  rows = 3,
  label = "Studio Notes",
  className,
}: {
  value: string | null;
  onSave: (notes: string | null) => void;
  saving?: boolean;
  rows?: number;
  label?: string;
  className?: string;
}) {
  const server = value ?? "";
  const [draft, setDraft] = useState(server);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(server);
  }, [server, dirty]);

  const save = () => {
    if (!dirty) return;
    setDirty(false);
    const trimmed = draft.trim();
    if (trimmed === server.trim()) return;
    onSave(trimmed ? trimmed : null);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <div className="flex items-center gap-2 text-11 text-text-muted">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Saving" />}
          {dirty && (
            <button
              type="button"
              // Keep focus in the textarea until the click lands (blur would save first anyway).
              onMouseDown={(e) => e.preventDefault()}
              onClick={save}
              className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary-text hover:bg-primary/20 cursor-pointer"
            >
              Save
            </button>
          )}
        </div>
      </div>
      <textarea
        rows={rows}
        value={draft}
        maxLength={NOTES_MAX}
        placeholder="Add a note about this customer…"
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={save}
        className="w-full rounded-lg border border-border bg-surface-muted p-2.5 text-12 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
