import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn.ts";

/**
 * Local helper: editable list of short strings shown as chips.
 * Enter or comma adds, Backspace on an empty field removes the last chip.
 */
export function ChipsInput({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter",
  hint,
  className,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 shadow-sm",
          "focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/40",
        )}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-2.5 pr-1 text-sm text-emerald-800"
          >
            <span className="truncate">{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={values.length === 0 ? placeholder : "Add…"}
          className="h-8 min-w-24 flex-1 bg-transparent px-1 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm"
        />
      </div>
      {hint && <p className="text-sm text-gray-500">{hint}</p>}
    </div>
  );
}
