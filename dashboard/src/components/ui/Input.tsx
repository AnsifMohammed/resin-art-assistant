import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn.ts";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const fieldBase =
  "block w-full rounded-lg border bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 shadow-sm " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 " +
  "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldBase, "h-11", error ? "border-red-400 focus:border-red-500 focus:ring-red-500/30" : "border-gray-300", className)}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
