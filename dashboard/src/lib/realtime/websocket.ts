import { Emitter, type ConnectionStatus, type RealtimeTransport } from "./transport.ts";

/**
 * Raw WebSocket transport for a backend built on @fastify/websocket.
 *
 * Expected protocol (see docs/contracts.md, "Real-time"):
 *   connect   GET {url}?token=<jwt>  (upgrade)
 *   server →  { "event": "<name>", "data": <payload> }
 *   client →  { "type": "subscribe" | "unsubscribe", "event": "<name>" }
 *             (sent for dynamic names like "message:new:<conversationId>")
 */
export function createWebSocketTransport(url: string): RealtimeTransport {
  const emitter = new Emitter();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let ws: WebSocket | null = null;
  let token: string | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  const setStatus = (s: ConnectionStatus) => statusListeners.forEach((l) => l(s));
  const isDynamic = (event: string) => event.split(":").length > 2;
  const send = (frame: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  };

  const open = () => {
    if (stopped || !token) return;
    setStatus("connecting");
    const target = new URL(url, window.location.href);
    target.protocol = target.protocol === "https:" ? "wss:" : target.protocol === "http:" ? "ws:" : target.protocol;
    target.searchParams.set("token", token);
    const socket = new WebSocket(target);
    ws = socket;

    socket.onopen = () => {
      retry = 0;
      setStatus("connected");
      for (const event of emitter.events()) if (isDynamic(event)) send({ type: "subscribe", event });
    };
    socket.onmessage = (msg) => {
      try {
        const frame = JSON.parse(String(msg.data)) as { event?: string; data?: unknown };
        if (frame.event) emitter.emit(frame.event, frame.data);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      setStatus("disconnected");
      if (stopped) return;
      // Exponential backoff, capped at 30s. Polling covers the gap.
      const delay = Math.min(30_000, 1000 * 2 ** retry++);
      timer = setTimeout(open, delay);
    };
    socket.onerror = () => socket.close();
  };

  return {
    connect(t) {
      token = t;
      stopped = false;
      clearTimeout(timer);
      ws?.close();
      open();
    },
    disconnect() {
      stopped = true;
      clearTimeout(timer);
      const s = ws;
      ws = null;
      s?.close();
      setStatus("disconnected");
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    on(event, handler) {
      const first = emitter.count(event) === 0;
      const off = emitter.add(event, handler as (p: unknown) => void);
      if (first && isDynamic(event)) send({ type: "subscribe", event });
      return () => {
        off();
        if (emitter.count(event) === 0 && isDynamic(event)) send({ type: "unsubscribe", event });
      };
    },
  };
}
