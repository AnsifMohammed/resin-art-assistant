import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// ─── Mocks ───────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  /** conversationId -> open escalation (assignedToUserId null = unassigned). Missing = none open. */
  open: new Map<string, { businessId: string; assignedToUserId: string | null }>(),
  users: new Map<string, string>(), // userId -> businessId (active users)
}));

vi.mock("../src/lib/userStatus.ts", () => ({
  checkUserStatus: async (userId: string, businessId: string) =>
    h.users.get(userId) === businessId
      ? { ok: true }
      : { ok: false, statusCode: 401, message: "Account not found", code: "ACCOUNT_DEACTIVATED" },
  assertUserActive: async () => {},
  invalidateUserStatus: () => {},
  clearUserStatusCache: () => {},
}));

vi.mock("../src/realtime/access.ts", () => ({
  staffCanAccessConversation: async (businessId: string, userId: string, conversationId: string) => {
    const e = h.open.get(conversationId);
    return Boolean(e && e.businessId === businessId && (e.assignedToUserId === null || e.assignedToUserId === userId));
  },
  conversationStaffAccess: async (businessId: string, conversationId: string) => {
    const e = h.open.get(conversationId);
    if (!e || e.businessId !== businessId) return null;
    return e.assignedToUserId ? { userId: e.assignedToUserId } : { anyStaff: true };
  },
}));

vi.mock("../src/db/index.ts", () => ({
  db: {},
  sql: Object.assign(() => Promise.resolve([]), { end: vi.fn() }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Frame = { event: string; data: any };
interface TestClient {
  ws: any;
  frames: Frame[];
  events: () => string[];
  send: (frame: object) => void;
  next: (event: string, timeoutMs?: number) => Promise<Frame>;
}

let app: Awaited<ReturnType<typeof import("../src/index.ts").buildServer>>;
let events: typeof import("../src/realtime/events.ts");
let realtime: typeof import("../src/realtime/websocket.ts");
const open: TestClient[] = [];

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function connect(sub: string, role: "admin" | "staff", businessId = "biz-1"): Promise<TestClient> {
  const token = app.jwt.sign({ sub, businessId, role, name: sub });
  const ws = await app.injectWS(`/ws?token=${token}`);
  const frames: Frame[] = [];
  const waiters: Array<{ event: string; resolve: (f: Frame) => void }> = [];
  ws.on("message", (raw: Buffer) => {
    const f = JSON.parse(raw.toString()) as Frame;
    frames.push(f);
    for (const w of [...waiters]) {
      if (w.event === f.event) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(f);
      }
    }
  });
  const client: TestClient = {
    ws,
    frames,
    events: () => frames.map((f) => f.event),
    send: (frame) => ws.send(JSON.stringify(frame)),
    next: (event, timeoutMs = 500) =>
      new Promise<Frame>((resolve, reject) => {
        const hit = frames.find((f) => f.event === event);
        if (hit) return resolve(hit);
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
        waiters.push({ event, resolve: (f) => (clearTimeout(t), resolve(f)) });
      }),
  };
  open.push(client);
  await tick(); // let the async connect handler register the client
  return client;
}

const message = (conversationId: string, businessId = "biz-1", extra: Record<string, unknown> = {}) => ({
  id: `msg-${Math.random().toString(36).slice(2)}`,
  conversationId,
  businessId,
  direction: "inbound" as const,
  senderType: "customer" as const,
  senderId: null,
  content: "I want a refund",
  mediaUrls: [],
  metaMessageId: null,
  deliveryStatus: "delivered" as const,
  metadata: {},
  createdAt: new Date("2026-09-28T10:00:00Z"),
  ...extra,
});

beforeAll(async () => {
  events = await import("../src/realtime/events.ts");
  realtime = await import("../src/realtime/websocket.ts");
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  h.open.clear();
  h.users.clear();
  for (const [id, biz] of [
    ["admin-1", "biz-1"],
    ["staff-1", "biz-1"],
    ["staff-2", "biz-1"],
    ["admin-x", "biz-2"],
    ["staff-x", "biz-2"],
  ]) h.users.set(id as string, biz as string);
});

afterEach(async () => {
  for (const c of open.splice(0)) c.ws.terminate();
  await tick();
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

describe("realtime scoping: admin vs staff vs other business", () => {
  it("message:new goes to admins of the business only (never staff, never other businesses)", async () => {
    const [admin, staff, otherAdmin] = [await connect("admin-1", "admin"), await connect("staff-1", "staff"), await connect("admin-x", "admin", "biz-2")];
    const msg = message("conv-1");
    events.emitMessageNew(msg);
    const f = await admin.next("message:new");
    expect(f.data).toEqual({ conversationId: "conv-1", message: JSON.parse(JSON.stringify(msg)) });
    await tick();
    expect(staff.frames).toEqual([]);
    expect(otherAdmin.frames).toEqual([]);
  });

  it("conversation:updated is admin only", async () => {
    const [admin, staff, otherAdmin] = [await connect("admin-1", "admin"), await connect("staff-1", "staff"), await connect("admin-x", "admin", "biz-2")];
    events.emitConversationUpdated("biz-1", { conversationId: "conv-1", state: "escalated", tag: null });
    expect((await admin.next("conversation:updated")).data).toEqual({ conversationId: "conv-1", state: "escalated", tag: null });
    await tick();
    expect(staff.frames).toEqual([]);
    expect(otherAdmin.frames).toEqual([]);
  });

  it("escalation:new reaches admin and all staff of the business, not other businesses", async () => {
    const [admin, s1, s2, otherStaff] = [
      await connect("admin-1", "admin"), await connect("staff-1", "staff"), await connect("staff-2", "staff"), await connect("staff-x", "staff", "biz-2"),
    ];
    const payload = { escalationId: "esc-1", conversationId: "conv-1", reason: "intent_refund", customerName: "Meera" };
    events.emitEscalationNew("biz-1", payload);
    for (const c of [admin, s1, s2]) expect((await c.next("escalation:new")).data).toEqual(payload);
    await tick();
    expect(otherStaff.frames).toEqual([]);
  });

  it("escalation:assigned: admins get the generic event, only the assignee gets escalation:assigned:<id>", async () => {
    const [admin, s1, s2, otherAdmin] = [
      await connect("admin-1", "admin"), await connect("staff-1", "staff"), await connect("staff-2", "staff"), await connect("admin-x", "admin", "biz-2"),
    ];
    const payload = { escalationId: "esc-1", conversationId: "conv-1", assignedToUserId: "staff-1" };
    events.emitEscalationAssigned("biz-1", payload, null);
    expect((await admin.next("escalation:assigned")).data).toEqual(payload);
    expect((await s1.next("escalation:assigned:staff-1")).data).toEqual(payload);
    await tick();
    expect(admin.events()).not.toContain("escalation:assigned:staff-1");
    expect(s1.events()).toEqual(["escalation:assigned:staff-1"]);
    expect(s2.frames).toEqual([]);
    expect(otherAdmin.frames).toEqual([]);
  });

  it("reassign/unassign also tells the previous assignee on their own topic", async () => {
    const [s1, s2] = [await connect("staff-1", "staff"), await connect("staff-2", "staff")];
    events.emitEscalationAssigned("biz-1", { escalationId: "esc-1", conversationId: "conv-1", assignedToUserId: "staff-2" }, "staff-1");
    expect((await s1.next("escalation:assigned:staff-1")).data.assignedToUserId).toBe("staff-2");
    expect((await s2.next("escalation:assigned:staff-2")).data.assignedToUserId).toBe("staff-2");

    events.emitEscalationAssigned("biz-1", { escalationId: "esc-1", conversationId: "conv-1", assignedToUserId: null }, "staff-2");
    await tick();
    expect(s2.events().filter((e) => e === "escalation:assigned:staff-2")).toHaveLength(2);
  });

  it("settings:updated is admin only and business scoped", async () => {
    const [admin, staff, otherAdmin] = [await connect("admin-1", "admin"), await connect("staff-1", "staff"), await connect("admin-x", "admin", "biz-2")];
    events.emitSettingsUpdated("biz-1", { paused: true });
    expect((await admin.next("settings:updated")).data).toEqual({ paused: true });
    await tick();
    expect(staff.frames).toEqual([]);
    expect(otherAdmin.frames).toEqual([]);
  });

  it("a staff token cannot connect with another business's id (account check)", async () => {
    const token = app.jwt.sign({ sub: "staff-1", businessId: "biz-2", role: "staff", name: "x" });
    const ws = await app.injectWS(`/ws?token=${token}`);
    const code = await new Promise<number>((resolve) => ws.on("close", (c: number) => resolve(c)));
    expect(code).toBe(4401);
  });
});

// ─── Per-conversation subscriptions ─────────────────────────────────────────

describe("message:new:<conversationId> subscriptions", () => {
  it("staff may subscribe to an unassigned open escalation and then receive its messages", async () => {
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: null });
    const staff = await connect("staff-1", "staff");
    staff.send({ type: "subscribe", event: "message:new:conv-1" });
    expect((await staff.next("subscribed")).data).toEqual({ event: "message:new:conv-1" });

    events.emitMessageNew(message("conv-1"));
    expect((await staff.next("message:new:conv-1")).data.conversationId).toBe("conv-1");
    expect(staff.events()).not.toContain("message:new");
  });

  it("denies staff subscriptions to conversations without an open escalation, assigned to others, or in another business", async () => {
    h.open.set("conv-other", { businessId: "biz-1", assignedToUserId: "staff-2" });
    h.open.set("conv-biz2", { businessId: "biz-2", assignedToUserId: null });
    const staff = await connect("staff-1", "staff");
    for (const id of ["conv-none", "conv-other", "conv-biz2"]) staff.send({ type: "subscribe", event: `message:new:${id}` });
    await tick(50);
    expect(staff.frames.filter((f) => f.event === "subscription:denied").map((f) => f.data.event)).toEqual([
      "message:new:conv-none", "message:new:conv-other", "message:new:conv-biz2",
    ]);

    events.emitMessageNew(message("conv-other"));
    events.emitMessageNew(message("conv-biz2", "biz-2"));
    await tick();
    expect(staff.events().some((e) => e.startsWith("message:new"))).toBe(false);
  });

  it("only message:new:<id> topics are subscribable (no opting into generic broadcasts)", async () => {
    const staff = await connect("staff-1", "staff");
    staff.send({ type: "subscribe", event: "conversation:updated" });
    staff.send({ type: "subscribe", event: "message:new" });
    await tick();
    expect(staff.frames.map((f) => f.data.reason)).toEqual(["unknown_event", "unknown_event"]);
    events.emitConversationUpdated("biz-1", { conversationId: "c", state: "escalated", tag: null });
    events.emitMessageNew(message("c"));
    await tick();
    expect(staff.frames).toHaveLength(2);
  });

  it("resolve drops the staff subscription: subscription:revoked, then no further messages", async () => {
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: "staff-1" });
    const staff = await connect("staff-1", "staff");
    staff.send({ type: "subscribe", event: "message:new:conv-1" });
    await staff.next("subscribed");

    h.open.delete("conv-1"); // escalation resolved
    events.emitConversationAccessChanged("biz-1", "conv-1");
    expect((await staff.next("subscription:revoked")).data).toEqual({ event: "message:new:conv-1", conversationId: "conv-1" });

    events.emitMessageNew(message("conv-1"));
    await tick();
    expect(staff.events()).not.toContain("message:new:conv-1");
  });

  it("reassigning to another staff member revokes the first one's subscription (via emitEscalationAssigned)", async () => {
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: null });
    const [s1, s2] = [await connect("staff-1", "staff"), await connect("staff-2", "staff")];
    for (const s of [s1, s2]) {
      s.send({ type: "subscribe", event: "message:new:conv-1" });
      await s.next("subscribed");
    }
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: "staff-2" });
    events.emitEscalationAssigned("biz-1", { escalationId: "esc-1", conversationId: "conv-1", assignedToUserId: "staff-2" }, null);
    await s1.next("subscription:revoked");

    events.emitMessageNew(message("conv-1"));
    await s2.next("message:new:conv-1");
    await tick();
    expect(s1.events()).not.toContain("message:new:conv-1");
    expect(s2.events()).not.toContain("subscription:revoked");
  });

  it("re-checks authorization at emit time even without an access-changed event", async () => {
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: null });
    const staff = await connect("staff-1", "staff");
    staff.send({ type: "subscribe", event: "message:new:conv-1" });
    await staff.next("subscribed");

    h.open.delete("conv-1"); // e.g. resolved by another API process
    events.emitMessageNew(message("conv-1"));
    await staff.next("subscription:revoked");
    expect(staff.events()).not.toContain("message:new:conv-1");
  });

  it("admins may subscribe to any conversation topic of their business", async () => {
    const admin = await connect("admin-1", "admin");
    admin.send({ type: "subscribe", event: "message:new:conv-9" });
    await admin.next("subscribed");
    events.emitMessageNew(message("conv-9"));
    await admin.next("message:new:conv-9");
    expect(admin.events()).toContain("message:new");
  });

  it("unsubscribe stops delivery", async () => {
    h.open.set("conv-1", { businessId: "biz-1", assignedToUserId: null });
    const staff = await connect("staff-1", "staff");
    staff.send({ type: "subscribe", event: "message:new:conv-1" });
    await staff.next("subscribed");
    staff.send({ type: "unsubscribe", event: "message:new:conv-1" });
    await tick();
    events.emitMessageNew(message("conv-1"));
    await tick();
    expect(staff.events()).toEqual(["subscribed"]);
  });
});

// ─── Heartbeat and disconnects ──────────────────────────────────────────────

describe("heartbeat", () => {
  it("keeps responsive sockets and terminates ones that miss a pong", async () => {
    const alive = await connect("admin-1", "admin");
    const dead = await connect("staff-1", "staff");
    // injectWS clients do not auto-pong: answer for the live one, stay silent for the dead one.
    alive.ws.on("ping", () => alive.ws.pong());
    const closed = new Promise<void>((resolve) => dead.ws.on("close", () => resolve()));

    expect(realtime.runHeartbeat()).toBe(0); // round 1: ping everyone
    await tick(50);
    expect(realtime.runHeartbeat()).toBe(1); // round 2: the silent one is terminated
    await closed;

    events.emitEscalationNew("biz-1", { escalationId: "e", conversationId: "c", reason: "manual", customerName: "x" });
    await alive.next("escalation:new");
    expect(realtime.connectedClientCount()).toBe(1);
  });

  it("disconnectUserEverywhere closes that user's sockets with 4403", async () => {
    const staff = await connect("staff-1", "staff");
    const closed = new Promise<number>((resolve) => staff.ws.on("close", (c: number) => resolve(c)));
    events.disconnectUserEverywhere("biz-1", "staff-1");
    expect(await closed).toBe(4403);
  });
});
