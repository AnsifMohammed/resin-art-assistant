import { useCallback, useEffect, useState } from "react";
import { subscribePush } from "../api/push.ts";
import type { PushSubscribeRequest } from "../types/index.ts";
import { useAuth } from "./useAuth.ts";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || "";

export type PushState =
  /** No VAPID key, no service worker/PushManager/Notification API, or no SW registered (dev). */
  | "unsupported"
  /** Supported, permission not asked yet: show an "Enable notifications" button (user gesture). */
  | "prompt"
  /** User blocked notifications in browser settings. */
  | "denied"
  | "subscribing"
  | "subscribed"
  | "error";

export interface PushNotifications {
  state: PushState;
  error: string | null;
  /** Call from a click/tap handler (iOS only allows the permission prompt from a user gesture). */
  enable: () => Promise<void>;
}

function apiSupported(): boolean {
  return (
    Boolean(VAPID_PUBLIC_KEY) &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** VAPID public key (base64url) → Uint8Array for applicationServerKey. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The app's SW registration, or null if none (PWA is disabled in `vite dev`). */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  // Wait for activation, but don't hang forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((resolve) => setTimeout(() => resolve(reg), 5000)),
  ]);
}

function toRequest(sub: PushSubscription): PushSubscribeRequest {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("Push subscription is missing keys");
  return { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh, auth } };
}

/** Get (or create) the browser subscription and register it with the backend for the current user. */
async function syncSubscription(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  // Always (re)send: the backend upserts on (userId, endpoint), and the device may now belong
  // to a different signed-in user than when it first subscribed.
  await subscribePush(toRequest(sub));
  return true;
}

// Shared across hook instances (App auto-sync + the TopBar button) to avoid duplicate POSTs.
let syncedForUser: string | null = null;
let inFlight: Promise<boolean> | null = null;

function syncOnce(userId: string): Promise<boolean> {
  if (syncedForUser === userId) return Promise.resolve(true);
  if (!inFlight) {
    inFlight = syncSubscription()
      .then((ok) => {
        if (ok) syncedForUser = userId;
        return ok;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function initialState(): PushState {
  if (!apiSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "subscribing";
  return "prompt";
}

/**
 * Web Push for escalation alerts.
 * - Does nothing without VITE_VAPID_PUBLIC_KEY or browser support.
 * - If permission is already granted, silently (re)subscribes after login.
 * - Never prompts on load; call enable() from a button so iOS/Safari accept the request.
 */
export function usePushNotifications(): PushNotifications {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      syncedForUser = null;
      return;
    }
    if (!apiSupported() || Notification.permission !== "granted") return;
    let cancelled = false;
    setState("subscribing");
    syncOnce(userId)
      .then((ok) => !cancelled && setState(ok ? "subscribed" : "unsupported"))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not enable notifications");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const enable = useCallback(async () => {
    if (!userId || !apiSupported()) return;
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "prompt");
        return;
      }
      setState("subscribing");
      const ok = await syncOnce(userId);
      setState(ok ? "subscribed" : "unsupported");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not enable notifications");
    }
  }, [userId]);

  return { state, error, enable };
}
