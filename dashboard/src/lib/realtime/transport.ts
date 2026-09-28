import type { SocketEventMap } from "../../types/index.ts";

/**
 * Transport-agnostic real-time interface.
 *
 * The spec lists @fastify/websocket (raw WebSocket) on the backend and
 * socket.io-client on the dashboard; the two cannot talk to each other.
 * Everything in the app depends only on this interface, so the concrete
 * transport can be swapped in one place (./index.ts → REALTIME_TRANSPORT).
 */

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type EventHandler<E extends keyof SocketEventMap = keyof SocketEventMap> = (payload: SocketEventMap[E]) => void;

export interface RealtimeTransport {
  /** Open the connection, authenticating with the JWT. Should reconnect on its own. */
  connect(token: string): void;
  /** Close the connection and stop reconnecting. */
  disconnect(): void;
  /** Status changes. Returns an unsubscribe function. */
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  /**
   * Listen for an event (static or dynamic name, e.g. `message:new:${conversationId}`).
   * Transports that need server-side rooms should send a subscribe frame here.
   * Returns an unsubscribe function.
   */
  on<E extends keyof SocketEventMap>(event: E, handler: EventHandler<E>): () => void;
}

/** Small typed listener registry shared by concrete transports. */
export class Emitter {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  add(event: string, handler: (payload: unknown) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      const current = this.handlers.get(event);
      current?.delete(handler);
      if (current && current.size === 0) this.handlers.delete(event);
    };
  }

  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error(`[realtime] handler for "${event}" threw`, err);
      }
    });
  }

  events(): string[] {
    return [...this.handlers.keys()];
  }

  count(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/** No server push available: always "disconnected", so the app polls every 5s. */
export function createNullTransport(): RealtimeTransport {
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  return {
    connect() {
      statusListeners.forEach((l) => l("disconnected"));
    },
    disconnect() {
      statusListeners.forEach((l) => l("disconnected"));
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    on() {
      return () => undefined;
    },
  };
}
