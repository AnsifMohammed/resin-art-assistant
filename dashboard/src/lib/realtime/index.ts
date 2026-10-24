import { API_BASE_URL } from "../../api/client.ts";
import { createNullTransport, type RealtimeTransport } from "./transport.ts";

export type { ConnectionStatus, EventHandler, RealtimeTransport } from "./transport.ts";

/**
 * Which real-time transport to use.
 *   "none"      → no push; the app polls every 5s
 *   "websocket" → raw WebSocket at `${API_BASE_URL}/ws` (@fastify/websocket; current, see docs/contracts.md)
 * Whatever the choice, the app falls back to 5s polling whenever the transport is not connected.
 * Concrete transports are loaded lazily so unused ones are not bundled into the main chunk.
 */
export const REALTIME_TRANSPORT: "none" | "websocket" = "websocket";

/** Polling interval used whenever the transport is not connected. */
export const POLL_INTERVAL_MS = 5_000;

export async function createTransport(): Promise<RealtimeTransport> {
  switch (REALTIME_TRANSPORT as string) {
    case "websocket": {
      const { createWebSocketTransport } = await import("./websocket.ts");
      return createWebSocketTransport(`${API_BASE_URL}/ws`);
    }
    default:
      return createNullTransport();
  }
}
