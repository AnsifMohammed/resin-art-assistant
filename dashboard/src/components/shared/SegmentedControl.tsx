import React from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string | React.ReactNode;
  title?: string;
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
  const sizeClasses = size === "sm" ? "p-0.5 h-8 text-11" : "p-1 text-xs";
  const itemPadding = size === "sm" ? "px-2 sm:px-2.5 h-[26px] text-11" : "px-2.5 sm:px-3 py-1.5";

  return (
    <div
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={`inline-flex items-center rounded-lg bg-surface-muted/90 border border-border/80 shadow-2xs ${sizeClasses} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const optTitle = opt.title ?? (typeof opt.label === "string" ? opt.label : undefined);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={optTitle}
            title={optTitle}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`relative flex items-center justify-center font-medium rounded-[6px] transition-colors duration-150 select-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 border cursor-pointer ${itemPadding} ${
              isSelected
                ? "bg-surface text-text shadow-xs font-semibold border-border/50"
                : "border-transparent text-text-muted hover:text-text hover:bg-surface/40"
            } ${disabled ? "pointer-events-none" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
