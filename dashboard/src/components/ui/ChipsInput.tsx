import React, { useState } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn.ts";

export interface ChipsInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxChips?: number;
  className?: string;
  disabled?: boolean;
}

export function ChipsInput({
  values,
  onChange,
  placeholder = "Type and press Enter...",
  maxChips = 30,
  className,
  disabled = false,
}: ChipsInputProps) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip();
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const addChip = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed) && values.length < maxChips) {
      onChange([...values, trimmed]);
      setInput("");
    }
  };

  const removeChip = (indexToRemove: number) => {
    if (disabled) return;
    onChange(values.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-border bg-surface text-text text-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all",
        disabled && "opacity-50 cursor-not-allowed bg-surface-muted",
        className,
      )}
    >
      {values.map((chip, idx) => (
        <span
          key={`${chip}-${idx}`}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-surface-muted border border-border text-xs font-medium text-text group"
        >
          <span>{chip}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeChip(idx)}
              aria-label={`Remove keyword ${chip}`}
              className="text-text-muted hover:text-text focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {values.length < maxChips && (
        <input
          type="text"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addChip}
          placeholder={values.length === 0 ? placeholder : "Add keyword..."}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-text placeholder:text-text-muted text-sm py-0.5"
        />
      )}
    </div>
  );
}
