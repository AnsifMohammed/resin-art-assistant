import { io, type Socket } from "socket.io-client";
import { Emitter, type ConnectionStatus, type RealtimeTransport } from "./transport.ts";

/**
 * Socket.io transport (requires a socket.io server, e.g. fastify-socket.io,
 * instead of @fastify/websocket). Auth via handshake `auth.token`.
 * Dynamic event names are joined with `socket.emit("subscribe", name)`.
 */
export function createSocketIoTransport(url: string, path = "/socket.io"): RealtimeTransport {
  const emitter = new Emitter();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  let socket: Socket | null = null;
  const setStatus = (s: ConnectionStatus) => statusListeners.forEach((l) => l(s));
  const isDynamic = (event: string) => event.split(":").length > 2;

  return {
    connect(token) {
      socket?.disconnect();
      setStatus("connecting");
      const s = io(url, { path, auth: { token }, transports: ["websocket"], reconnectionDelayMax: 30_000 });
      socket = s;
      s.on("connect", () => {
        setStatus("connected");
        for (const event of emitter.events()) if (isDynamic(event)) s.emit("subscribe", event);
      });
      s.on("disconnect", () => setStatus("disconnected"));
      s.on("connect_error", () => setStatus("disconnected"));
      s.onAny((event: string, data: unknown) => emitter.emit(event, data));
    },
    disconnect() {
      socket?.disconnect();
      socket = null;
      setStatus("disconnected");
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    on(event, handler) {
      const first = emitter.count(event) === 0;
      const off = emitter.add(event, handler as (p: unknown) => void);
      if (first && isDynamic(event)) socket?.emit("subscribe", event);
      return () => {
        off();
        if (emitter.count(event) === 0 && isDynamic(event)) socket?.emit("unsubscribe", event);
      };
    },
  };
}
