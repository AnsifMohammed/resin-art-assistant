import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getToken } from "../api/client.ts";
import { useToast } from "../components/ui/Toast.tsx";
import { useAuth } from "../hooks/useAuth.ts";
import { appendMessageToCache } from "../hooks/useConversations.ts";
import { escalationReasonLabel } from "../lib/escalationReasons.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import {
  createTransport,
  POLL_INTERVAL_MS,
  type ConnectionStatus,
  type EventHandler,
  type RealtimeTransport,
} from "../lib/realtime/index.ts";
import type { SettingsResponse, SocketEventMap } from "../types/index.ts";

export interface RealtimeContextValue {
  status: ConnectionStatus;
  connected: boolean;
  /** True while falling back to 5s polling (i.e. whenever not connected). */
  polling: boolean;
  subscribe: <E extends keyof SocketEventMap>(event: E, handler: EventHandler<E>) => () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * One shared real-time connection for the signed-in user.
 * - Role-aware default subscriptions keep TanStack Query caches fresh.
 * - When the transport is not connected, relevant queries are invalidated every 5s.
 *   invalidateQueries only refetches *mounted* queries, so staff never fetch admin data.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [transport, setTransport] = useState<RealtimeTransport | null>(null);
  // Subscriptions requested before the transport finished loading.
  const pending = useRef(new Set<{ event: keyof SocketEventMap; handler: EventHandler; off?: () => void }>());

  const userId = user?.id;
  const role = user?.role;

  // Create / tear down the transport with the session.
  useEffect(() => {
    const token = getToken();
    if (!userId || !token) return;
    let cancelled = false;
    let active: RealtimeTransport | null = null;
    let offStatus: (() => void) | undefined;
    void createTransport().then((t) => {
      if (cancelled) return;
      active = t;
      offStatus = t.onStatus(setStatus);
      for (const sub of pending.current) sub.off = t.on(sub.event, sub.handler);
      setTransport(t);
      t.connect(token);
    });
    return () => {
      cancelled = true;
      offStatus?.();
      for (const sub of pending.current) {
        sub.off?.();
        delete sub.off;
      }
      active?.disconnect();
      setTransport(null);
      setStatus("disconnected");
    };
  }, [userId]);

  const subscribe = useCallback<RealtimeContextValue["subscribe"]>((event, handler) => {
    const entry: { event: keyof SocketEventMap; handler: EventHandler; off?: () => void } = {
      event,
      handler: handler as EventHandler,
    };
    pending.current.add(entry);
    if (transport) entry.off = transport.on(event, handler);
    return () => {
      entry.off?.();
      pending.current.delete(entry);
    };
  }, [transport]);

  // Role-aware default subscriptions → cache updates/invalidation + escalation toast.
  useEffect(() => {
    if (!transport || !userId || !role) return;
    const offs: Array<() => void> = [];
    const invalidateConversations = () => void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    const invalidateEscalations = () => void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
    const invalidateConversation = (id: string) =>
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(id) });

    offs.push(
      transport.on("escalation:new", (e) => {
        invalidateEscalations();
        if (role === "admin") invalidateConversations();
        toast({
          variant: "warning",
          title: `New escalation: ${e.customerName}`,
          description: escalationReasonLabel(e.reason),
          action: { label: "Open", onClick: () => navigate(`/conversations/${e.conversationId}`) },
        });
      }),
    );

    if (role === "admin") {
      // State/tag changes also move items in and out of the escalation queue (escalate, resolve).
      offs.push(
        transport.on("conversation:updated", () => {
          invalidateConversations();
          invalidateEscalations();
        }),
      );
      offs.push(
        transport.on("escalation:assigned", (e) => {
          invalidateEscalations();
          invalidateConversation(e.conversationId);
        }),
      );
      offs.push(
        transport.on("message:new", (e) => {
          // Append to an open thread right away; lists refetch for previews and ordering.
          appendMessageToCache(qc, e.conversationId, e.message);
          void qc.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
          invalidateEscalations();
        }),
      );
      offs.push(
        transport.on("settings:updated", (e) => {
          qc.setQueryData<SettingsResponse>(queryKeys.settings.all, (prev) => (prev ? { ...prev, paused: e.paused } : prev));
          void qc.invalidateQueries({ queryKey: queryKeys.settings.all });
        }),
      );
    } else {
      // Staff: only their own assignments (gained or lost). Per-conversation messages are subscribed by
      // the chat view via useSocketEvent(`message:new:${conversationId}`).
      offs.push(
        transport.on(`escalation:assigned:${userId}`, (e) => {
          invalidateEscalations();
          invalidateConversation(e.conversationId);
        }),
      );
      // Resolved or reassigned away: refetch so the chat shows "not assigned to you" and the queue drops it.
      offs.push(
        transport.on("subscription:revoked", (e) => {
          invalidateEscalations();
          invalidateConversation(e.conversationId);
        }),
      );
    }
    return () => offs.forEach((off) => off());
  }, [transport, userId, role, qc, toast, navigate]);

  // Catch up after a reconnect: events sent while the socket was down were missed.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (status !== "connected") return;
    if (wasConnected.current) {
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      if (role === "admin") void qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    }
    wasConnected.current = true;
  }, [status, role, qc]);

  // Polling fallback: every 5s while not connected (and the tab is visible).
  const connected = status === "connected";
  useEffect(() => {
    if (!userId || connected) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, connected, qc]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, connected, polling: Boolean(userId) && !connected, subscribe }),
    [status, connected, userId, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
