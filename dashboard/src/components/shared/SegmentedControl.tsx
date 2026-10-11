import React from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string | React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  size = "md",
  disabled = false,
}: SegmentedControlProps<T>) {
  const sizeClasses = size === "sm" ? "p-0.5 text-xs" : "p-1 text-xs";
  const itemPadding = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";

  return (
    <div
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={`inline-flex items-center rounded-lg bg-surface-muted border border-border ${sizeClasses} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`relative flex items-center justify-center font-medium rounded-md transition-all duration-150 select-none ${itemPadding} ${
              isSelected
                ? "bg-surface text-text shadow-xs font-semibold"
                : "text-text-muted hover:text-text"
            } ${disabled ? "pointer-events-none" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
