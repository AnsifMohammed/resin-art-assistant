import { useEffect, useState } from "react";
import { Input, type InputProps } from "./Input.tsx";

/**
 * Local helper: numeric field that keeps the raw text while typing (so "" and "1." are allowed)
 * and reports a number, or null when empty/invalid.
 */
export function NumberInput({
  value,
  onValueChange,
  ...props
}: Omit<InputProps, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null || value === undefined || Number.isNaN(value) ? "" : String(value));

  // Follow external changes (discard, raw-JSON apply) without clobbering what is being typed.
  useEffect(() => {
    setText((prev) => {
      const parsed = prev.trim() === "" ? null : Number(prev);
      const current = value === undefined || (typeof value === "number" && Number.isNaN(value)) ? null : value;
      return parsed === current ? prev : current === null ? "" : String(current);
    });
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, "");
        setText(t);
        const n = t.trim() === "" ? null : Number(t);
        onValueChange(n === null || Number.isNaN(n) ? null : n);
      }}
    />
  );
}
