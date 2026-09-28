import { API_BASE_URL } from "../../api/client.ts";
import { createNullTransport, type RealtimeTransport } from "./transport.ts";

export type { ConnectionStatus, EventHandler, RealtimeTransport } from "./transport.ts";

/**
 * Which real-time transport to use.
 *   "none"      → no push; the app polls every 5s
 *   "websocket" → raw WebSocket at `${API_BASE_URL}/ws` (@fastify/websocket; current, see docs/contracts.md)
 *   "socketio"  → socket.io server (not provided by the backend)
 * Whatever the choice, the app falls back to 5s polling whenever the transport is not connected.
 * Concrete transports are loaded lazily so unused ones are not bundled into the main chunk.
 */
export const REALTIME_TRANSPORT: "none" | "websocket" | "socketio" = "websocket";

/** Polling interval used whenever the transport is not connected. */
export const POLL_INTERVAL_MS = 5_000;

export async function createTransport(): Promise<RealtimeTransport> {
  switch (REALTIME_TRANSPORT as string) {
    case "websocket": {
      const { createWebSocketTransport } = await import("./websocket.ts");
      return createWebSocketTransport(`${API_BASE_URL}/ws`);
    }
    case "socketio": {
      const { createSocketIoTransport } = await import("./socketio.ts");
      // Relative base ("/api") → same origin through the proxy; absolute base → talk to it directly.
      if (/^https?:\/\//i.test(API_BASE_URL)) return createSocketIoTransport(new URL(API_BASE_URL).origin);
      return createSocketIoTransport(window.location.origin, `${API_BASE_URL}/socket.io`);
    }
    default:
      return createNullTransport();
  }
}
