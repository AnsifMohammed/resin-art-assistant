import { useMemo } from "react";
import { toast as sonner, type ExternalToast } from "sonner";

/**
 * Toast API used by the older pages and RealtimeContext.
 * Rendered by the app-wide sonner <Toaster /> (see main.tsx), so every toast
 * shares the new design. No provider needed.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms; 0 = sticky. Default 4000 (errors 6000). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

type ToastId = string | number;

interface ToastApi {
  toast: (opts: ToastOptions) => ToastId;
  dismiss: (id: ToastId) => void;
}

function showToast(opts: ToastOptions): ToastId {
  const variant = opts.variant ?? "info";
  const duration = opts.duration ?? (variant === "error" ? 6000 : 4000);
  const options: ExternalToast = { duration: duration === 0 ? Number.POSITIVE_INFINITY : duration };
  if (opts.description) options.description = opts.description;
  if (opts.action) {
    const { label, onClick } = opts.action;
    options.action = { label, onClick: () => onClick() };
  }
  return sonner[variant](opts.title, options);
}

export function useToast(): ToastApi {
  return useMemo(() => ({ toast: showToast, dismiss: (id: ToastId) => void sonner.dismiss(id) }), []);
}
