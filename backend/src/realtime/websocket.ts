import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { WebSocket } from "ws";
import type { messages } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { checkUserStatus, invalidateUserStatus } from "../lib/userStatus.ts";
import type { JwtPayload } from "../middleware/authenticate.ts";
import { conversationStaffAccess, staffCanAccessConversation } from "./access.ts";

/**
 * Raw WebSocket server at GET /ws?token=<jwt> (see docs/contracts.md, "Real-time").
 *
 *   server → client  { "event": "<name>", "data": <payload> }
 *   client → server  { "type": "subscribe" | "unsubscribe", "event": "message:new:<conversationId>" }
 *
 * This module owns the connected clients of THIS process and the role scoping
 * rules. Emitting goes through ./events.ts, which hands envelopes to ./bus.ts;
 * the bus delivers them here and, via Postgres NOTIFY, on every other API process.
 */

export type MessageRow = typeof messages.$inferSelect;

export interface ConversationUpdatedPayload {
  conversationId: string;
  state: string;
  tag: string | null;
}

export interface EscalationNewPayload {
  escalationId: string;
  conversationId: string;
  reason: string;
  customerName: string;
}

export interface EscalationAssignedPayload {
  escalationId: string;
  conversationId: string;
  assignedToUserId: string | null;
}

export interface SettingsUpdatedPayload {
  paused: boolean;
}

/** Internal, transport-neutral description of something that happened. */
export type RealtimeEnvelope =
  | { kind: "message:new"; businessId: string; conversationId: string; message: MessageRow }
  | { kind: "conversation:updated"; businessId: string; payload: ConversationUpdatedPayload }
  | { kind: "escalation:new"; businessId: string; payload: EscalationNewPayload }
  | {
      kind: "escalation:assigned";
      businessId: string;
      payload: EscalationAssignedPayload;
      /** Staff member who held the escalation before this change (told they lost it). */
      previousAssigneeId: string | null;
    }
  | { kind: "settings:updated"; businessId: string; payload: SettingsUpdatedPayload }
  /** Escalation resolved/reassigned: re-check staff message subscriptions for this conversation. */
  | { kind: "access:changed"; businessId: string; conversationId: string }
  | { kind: "user:disconnect"; businessId: string; userId: string };

interface ClientConnection {
  socket: WebSocket;
  user: JwtPayload;
  subscriptions: Set<string>;
  /** Cleared on every heartbeat ping, set again by the pong. */
  isAlive: boolean;
}

export const HEARTBEAT_INTERVAL_MS = 30_000;
const MESSAGE_TOPIC_PREFIX = "message:new:";

const clients = new Map<WebSocket, ClientConnection>();

const messageTopic = (conversationId: string) => `${MESSAGE_TOPIC_PREFIX}${conversationId}`;

function send(client: ClientConnection, event: string, data: unknown): void {
  if (client.socket.readyState !== client.socket.OPEN) return;
  try {
    client.socket.send(JSON.stringify({ event, data }));
  } catch (err) {
    logger.error({ err, userId: client.user.sub }, "Failed to send websocket frame");
  }
}

function clientsOf(businessId: string, filter?: (c: ClientConnection) => boolean): ClientConnection[] {
  const out: ClientConnection[] = [];
  for (const client of clients.values()) {
    if (client.user.businessId !== businessId) continue; // never cross businesses
    if (filter && !filter(client)) continue;
    out.push(client);
  }
  return out;
}

const isAdmin = (c: ClientConnection) => c.user.role === "admin";

function revoke(client: ClientConnection, topic: string, conversationId: string): void {
  client.subscriptions.delete(topic);
  send(client, "subscription:revoked", { event: topic, conversationId });
}

/** May this staff member (still) follow the conversation, given its current escalation? */
function staffAllowed(
  access: Awaited<ReturnType<typeof conversationStaffAccess>>,
  userId: string,
): boolean {
  if (!access) return false;
  return "anyStaff" in access || access.userId === userId;
}

async function deliverMessageNew(env: Extract<RealtimeEnvelope, { kind: "message:new" }>): Promise<void> {
  const payload = { conversationId: env.conversationId, message: env.message };
  const topic = messageTopic(env.conversationId);

  // Admins: the generic broadcast, plus the per-conversation topic if they subscribed.
  for (const c of clientsOf(env.businessId, isAdmin)) {
    send(c, "message:new", payload);
    if (c.subscriptions.has(topic)) send(c, topic, payload);
  }

  // Staff: only the per-conversation topic, re-authorized at emit time so a
  // resolve or reassign since they subscribed cuts them off.
  const staff = clientsOf(env.businessId, (c) => c.user.role === "staff" && c.subscriptions.has(topic));
  if (staff.length === 0) return;
  const access = await conversationStaffAccess(env.businessId, env.conversationId);
  for (const c of staff) {
    if (!c.subscriptions.has(topic)) continue; // unsubscribed while we were checking
    if (staffAllowed(access, c.user.sub)) send(c, topic, payload);
    else revoke(c, topic, env.conversationId);
  }
}

async function recheckAccess(env: Extract<RealtimeEnvelope, { kind: "access:changed" }>): Promise<void> {
  const topic = messageTopic(env.conversationId);
  const staff = clientsOf(env.businessId, (c) => c.user.role === "staff" && c.subscriptions.has(topic));
  if (staff.length === 0) return;
  const access = await conversationStaffAccess(env.businessId, env.conversationId);
  for (const c of staff) {
    if (!staffAllowed(access, c.user.sub)) revoke(c, topic, env.conversationId);
  }
}

/** Deliver one envelope to the sockets connected to this process, applying role scoping. */
export async function deliverLocal(env: RealtimeEnvelope): Promise<void> {
  switch (env.kind) {
    case "message:new":
      return deliverMessageNew(env);

    case "conversation:updated":
      // Admin only: staff never get generic conversation broadcasts.
      for (const c of clientsOf(env.businessId, isAdmin)) send(c, "conversation:updated", env.payload);
      return;

    case "escalation:new":
      // Admin + all staff of the business (new escalations are unassigned, so any staff may pick them up).
      for (const c of clientsOf(env.businessId)) send(c, "escalation:new", env.payload);
      return;

    case "escalation:assigned": {
      const { assignedToUserId } = env.payload;
      for (const c of clientsOf(env.businessId, isAdmin)) send(c, "escalation:assigned", env.payload);
      const targets = new Set([assignedToUserId, env.previousAssigneeId].filter((id): id is string => Boolean(id)));
      for (const userId of targets) {
        const event = `escalation:assigned:${userId}`;
        for (const c of clientsOf(env.businessId, (x) => x.user.sub === userId && x.user.role === "staff")) {
          send(c, event, env.payload);
        }
      }
      return;
    }

    case "settings:updated":
      for (const c of clientsOf(env.businessId, isAdmin)) send(c, "settings:updated", env.payload);
      return;

    case "access:changed":
      return recheckAccess(env);

    case "user:disconnect":
      invalidateUserStatus(env.userId);
      disconnectUser(env.userId);
      return;
  }
}

/** Close every open socket of a user on this process (e.g. on deactivation). Returns how many closed. */
export function disconnectUser(userId: string): number {
  let closed = 0;
  for (const [socket, client] of clients) {
    if (client.user.sub !== userId) continue;
    clients.delete(socket);
    try {
      socket.close(4403, "Account deactivated");
    } catch (err) {
      logger.error({ err, userId }, "Failed to close websocket");
    }
    closed++;
  }
  return closed;
}

/**
 * One heartbeat round: terminate sockets that did not answer the previous ping,
 * then ping the rest. Runs every HEARTBEAT_INTERVAL_MS.
 */
export function runHeartbeat(): number {
  let terminated = 0;
  for (const [socket, client] of clients) {
    if (!client.isAlive) {
      clients.delete(socket);
      socket.terminate();
      terminated++;
      logger.info({ userId: client.user.sub }, "Terminated unresponsive websocket");
      continue;
    }
    client.isAlive = false;
    try {
      socket.ping();
    } catch (err) {
      logger.error({ err, userId: client.user.sub }, "WebSocket ping failed");
    }
  }
  return terminated;
}

/** Number of sockets connected to this process (tests / diagnostics). */
export function connectedClientCount(): number {
  return clients.size;
}

async function handleFrame(client: ClientConnection, raw: Buffer | string): Promise<void> {
  let frame: { type?: unknown; event?: unknown };
  try {
    frame = JSON.parse(raw.toString());
  } catch {
    logger.warn({ userId: client.user.sub }, "Invalid WebSocket frame received");
    return;
  }
  const { type, event } = frame;
  if (typeof event !== "string") return;

  if (type === "unsubscribe") {
    client.subscriptions.delete(event);
    return;
  }
  if (type !== "subscribe") return;

  // Only per-conversation message topics need (or accept) a subscription;
  // every other event is pushed according to role.
  if (!event.startsWith(MESSAGE_TOPIC_PREFIX) || event.length === MESSAGE_TOPIC_PREFIX.length) {
    send(client, "subscription:denied", { event, reason: "unknown_event" });
    return;
  }

  const conversationId = event.slice(MESSAGE_TOPIC_PREFIX.length);
  if (client.user.role !== "admin") {
    const allowed = await staffCanAccessConversation(client.user.businessId, client.user.sub, conversationId);
    if (!allowed) {
      logger.warn({ userId: client.user.sub, conversationId }, "Staff forbidden from subscribing to conversation");
      send(client, "subscription:denied", { event, reason: "forbidden" });
      return;
    }
  }

  if (!clients.has(client.socket)) return; // closed meanwhile
  client.subscriptions.add(event);
  send(client, "subscribed", { event });
}

export const websocketRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const heartbeat = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    for (const socket of clients.keys()) socket.terminate();
    clients.clear();
  });

  app.get("/ws", { websocket: true }, async (socket, request) => {
    const query = request.query as Record<string, string | undefined>;
    const token = query.token;

    if (!token) {
      socket.close(4401, "Missing token");
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = app.jwt.verify<JwtPayload>(token);
    } catch {
      socket.close(4401, "Invalid token");
      return;
    }

    // Buffer frames that arrive while the account check below is running.
    const early: Array<Buffer | string> = [];
    const buffer = (raw: Buffer | string) => early.push(raw);
    socket.on("message", buffer);

    // Verify the account still exists, is active and matches the token's business.
    let status;
    try {
      status = await checkUserStatus(decoded.sub, decoded.businessId);
    } catch (err) {
      logger.error({ err, userId: decoded.sub }, "WebSocket user status check failed");
      socket.close(1011, "Internal error");
      return;
    }
    if (!status.ok) {
      socket.close(status.statusCode === 403 ? 4403 : 4401, status.message);
      return;
    }
    if (socket.readyState !== socket.OPEN) return;

    const client: ClientConnection = {
      socket,
      user: decoded,
      subscriptions: new Set<string>(),
      isAlive: true,
    };

    clients.set(socket, client);
    logger.info({ userId: decoded.sub, role: decoded.role }, "WebSocket client connected");

    const onFrame = (raw: Buffer | string) => {
      handleFrame(client, raw).catch((err) => {
        logger.error({ err, userId: decoded.sub }, "Failed to handle WebSocket frame");
      });
    };
    socket.off("message", buffer);
    socket.on("message", onFrame);
    for (const raw of early) onFrame(raw);

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("close", () => {
      clients.delete(socket);
      logger.info({ userId: decoded.sub }, "WebSocket client disconnected");
    });
  });
};
