import { useContext, useEffect, useRef } from "react";
import { RealtimeContext, type RealtimeContextValue } from "../context/RealtimeContext.tsx";
import type { EventHandler } from "../lib/realtime/index.ts";
import type { SocketEventMap } from "../types/index.ts";

/**
 * Real-time connection status + subscribe(). Transport-agnostic; see lib/realtime.
 * While not connected the provider polls (invalidates mounted queries) every 5s.
 */
export function useSocket(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useSocket must be used inside <RealtimeProvider>");
  return ctx;
}

/**
 * Subscribe to one event for the lifetime of the component. The handler can change
 * between renders without resubscribing. Pass null/undefined as the event to skip.
 *
 * @example useSocketEvent(id ? `message:new:${id}` : null, (e) => append(e.message))
 */
export function useSocketEvent<E extends keyof SocketEventMap>(
  event: E | null | undefined,
  handler: EventHandler<E>,
): void {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!event) return;
    return subscribe(event, ((payload: SocketEventMap[E]) => handlerRef.current(payload)) as EventHandler<E>);
  }, [event, subscribe]);
}
