import { Writable } from "node:stream";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// ─── In-memory users table with a drizzle-aware where() ──────────────────────

interface UserRow {
  id: string;
  businessId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "staff";
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const store = vi.hoisted(() => ({
  users: [] as any[],
  dbDown: false,
}));

vi.mock("../src/db/index.ts", () => {
  // Collect { column: value } pairs from eq()/and() SQL chunks.
  const conditions = (clause: any): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    let lastCol: string | null = null;
    const walk = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node.queryChunks)) {
        node.queryChunks.forEach(walk);
        return;
      }
      if (node.constructor?.name === "Param") {
        if (lastCol) out[lastCol] = node.value;
        lastCol = null;
      } else if (typeof node.name === "string" && node.table) {
        lastCol = node.name;
      }
    };
    walk(clause);
    return out;
  };
  const camel: Record<string, string> = { business_id: "businessId", id: "id", email: "email" };
  const matches = (row: any, conds: Record<string, unknown>) =>
    Object.entries(conds).every(([col, v]) => row[camel[col] ?? col] === v);
  const tableName = (t: any) => t?.[Symbol.for("drizzle:Name")] ?? "";

  const project = (row: any, fields?: Record<string, any>) => {
    if (!fields) return { ...row };
    const out: any = {};
    for (const [k, col] of Object.entries(fields)) {
      const c = camel[col.name] ?? col.name;
      out[k] = row[c];
    }
    return out;
  };

  const sql = Object.assign(
    (..._args: unknown[]) => (store.dbDown ? Promise.reject(new Error("db down")) : Promise.resolve([{ "?column?": 1 }])),
    { end: vi.fn() },
  );

  return {
    db: {
      select: (fields?: Record<string, any>) => ({
        from: (table: any) => ({
          where: (clause: any) => {
            if (tableName(table) !== "users") return Promise.resolve([]);
            const conds = conditions(clause);
            return Promise.resolve(store.users.filter((u) => matches(u, conds)).map((u) => project(u, fields)));
          },
        }),
      }),
      insert: (table: any) => ({
        values: (val: any) => {
          const row =
            tableName(table) === "users"
              ? { id: `user-${store.users.length + 1}`, active: true, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), ...val }
              : { id: "row-1", ...val };
          if (tableName(table) === "users") store.users.push(row);
          const p: any = Promise.resolve([row]);
          p.returning = () => Promise.resolve([row]);
          return p;
        },
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (clause: any) => {
            const conds = conditions(clause);
            const hit = tableName(table) === "users" ? store.users.filter((u) => matches(u, conds)) : [];
            hit.forEach((u) => Object.assign(u, vals));
            const p: any = Promise.resolve(hit);
            p.returning = () => Promise.resolve(hit.map((u) => ({ ...u })));
            return p;
          },
        }),
      }),
    },
    schema: {},
    sql,
  };
});

vi.mock("../src/services/email.ts", () => ({
  sendStaffWelcome: vi.fn(),
  sendEscalationAlert: vi.fn(),
}));

// Spy on argon2.verify while keeping the real implementation.
vi.mock("argon2", async (importOriginal) => {
  const actual: any = await importOriginal();
  const real = actual.default ?? actual;
  const verify = vi.fn((hash: string, plain: string) => real.verify(hash, plain));
  const mod = { ...real, verify };
  return { ...actual, ...mod, default: mod };
});

// ─── App setup ───────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof import("../src/index.ts").buildServer>>;
let redisMod: typeof import("../src/lib/redis.ts");
let userStatus: typeof import("../src/lib/userStatus.ts");
let realtime: typeof import("../src/realtime/websocket.ts");
let hashes: { admin: string; staff: string };

function seed(): void {
  const now = new Date("2026-01-01T00:00:00Z");
  store.users = [
    {
      id: "admin-1", businessId: "biz-1", name: "Asha", email: "asha@asharesins.com",
      passwordHash: hashes.admin, role: "admin", active: true, lastLoginAt: null, createdAt: now, updatedAt: now,
    },
    {
      id: "staff-1", businessId: "biz-1", name: "Priya", email: "priya@asharesins.com",
      passwordHash: hashes.staff, role: "staff", active: true, lastLoginAt: null, createdAt: now, updatedAt: now,
    },
  ] satisfies UserRow[];
}

const sign = (sub: string, role: "admin" | "staff", businessId = "biz-1") =>
  app.jwt.sign({ sub, businessId, role, name: sub });

const login = (email: string, password: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: "/auth/login", headers, payload: { email, password } });

beforeAll(async () => {
  hashes = {
    admin: await argon2.hash("admin-password", { type: argon2.argon2id }),
    staff: await argon2.hash("staff-password", { type: argon2.argon2id }),
  };
  redisMod = await import("../src/lib/redis.ts");
  userStatus = await import("../src/lib/userStatus.ts");
  realtime = await import("../src/realtime/websocket.ts");
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  app.get("/__ip", async (req) => ({ ip: req.ip }));
  await app.ready();
});

beforeEach(() => {
  seed();
  store.dbDown = false;
  redisMod.inMemoryLoginLimiter.reset();
  redisMod.inMemoryLoginEmailLimiter.reset();
  userStatus.clearUserStatusCache();
  vi.mocked(argon2.verify).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── H1: deactivated users lose access ───────────────────────────────────────

describe("H1: account status is enforced on every authenticated request", () => {
  it("rejects a still-valid token of a deactivated user with 403 ACCOUNT_DEACTIVATED", async () => {
    store.users[1].active = false;
    const res = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { authorization: `Bearer ${sign("staff-1", "staff")}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects a token for a deleted user with 401", async () => {
    const res = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { authorization: `Bearer ${sign("ghost", "staff")}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects a token whose businessId does not match the user row", async () => {
    const res = await app.inject({
      method: "GET", url: "/users",
      headers: { authorization: `Bearer ${sign("admin-1", "admin", "biz-evil")}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("caches status briefly, but PATCH /users/:id invalidates it immediately", async () => {
    const staffAuth = { authorization: `Bearer ${sign("staff-1", "staff")}` };
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: staffAuth })).statusCode).toBe(200);

    // Out-of-band change is not seen yet: the cached status is still used.
    store.users[1].active = false;
    // /users is admin-only: FORBIDDEN (not ACCOUNT_DEACTIVATED) proves
    // authenticate() passed on the cached status.
    const cachedRes = await app.inject({ method: "GET", url: "/users", headers: staffAuth });
    expect(cachedRes.statusCode).toBe(403);
    expect(cachedRes.json().code).toBe("FORBIDDEN");
    store.users[1].active = true;

    // Admin deactivates via the API -> the next request is rejected at once.
    const patch = await app.inject({
      method: "PATCH", url: "/users/staff-1",
      headers: { authorization: `Bearer ${sign("admin-1", "admin")}` },
      payload: { active: false },
    });
    expect(patch.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/auth/me", headers: staffAuth });
    expect(after.statusCode).toBe(403);
    expect(after.json().code).toBe("ACCOUNT_DEACTIVATED");

    // Reactivation also takes effect immediately.
    await app.inject({
      method: "PATCH", url: "/users/staff-1",
      headers: { authorization: `Bearer ${sign("admin-1", "admin")}` },
      payload: { active: true },
    });
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: staffAuth })).statusCode).toBe(200);
  });

  it("cache entry expires after ~30s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const staffAuth = { authorization: `Bearer ${sign("staff-1", "staff")}` };
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: staffAuth })).statusCode).toBe(200);
    store.users[1].active = false;
    vi.setSystemTime(Date.now() + 31_000);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: staffAuth })).statusCode).toBe(403);
  });

  it("rejects WebSocket connections from deactivated users", async () => {
    store.users[1].active = false;
    const ws = await app.injectWS(`/ws?token=${sign("staff-1", "staff")}`);
    const code = await new Promise<number>((resolve) => ws.on("close", (c: number) => resolve(c)));
    expect(code).toBe(4403);
  });

  it("disconnectUser closes open sockets of that user on deactivation", async () => {
    const ws = await app.injectWS(`/ws?token=${sign("staff-1", "staff")}`);
    // Let the async connect handler register the client.
    await new Promise((r) => setTimeout(r, 20));
    const closed = new Promise<number>((resolve) => ws.on("close", (c: number) => resolve(c)));
    const patch = await app.inject({
      method: "PATCH", url: "/users/staff-1",
      headers: { authorization: `Bearer ${sign("admin-1", "admin")}` },
      payload: { active: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(await closed).toBe(4403);
    expect(realtime.disconnectUser("staff-1")).toBe(0);
  });
});

// ─── H2: rate limiting ───────────────────────────────────────────────────────

describe("H2: login rate limiting", () => {
  it("ignores X-Forwarded-For with the default TRUST_PROXY", async () => {
    const res = await app.inject({
      method: "GET", url: "/__ip",
      headers: { "x-forwarded-for": "203.0.113.9" },
      remoteAddress: "192.0.2.10",
    });
    expect(res.json().ip).toBe("192.0.2.10");
  });

  it("blocks the 6th attempt for one email even when the IP bucket is fresh each time", async () => {
    const variants = ["priya@asharesins.com", "PRIYA@asharesins.com", " Priya@AshaResins.com "];
    for (let i = 0; i < 5; i++) {
      redisMod.inMemoryLoginLimiter.reset(); // simulate a different source IP every time
      const res = await login(variants[i % variants.length]!, "wrong", {});
      expect(res.statusCode).toBe(401);
    }
    redisMod.inMemoryLoginLimiter.reset();
    const blocked = await login("priya@asharesins.com", "staff-password");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();

    // Other accounts are unaffected.
    redisMod.inMemoryLoginLimiter.reset();
    expect((await login("asha@asharesins.com", "admin-password")).statusCode).toBe(200);
  });

  it("successful login clears the per-email bucket", async () => {
    for (let i = 0; i < 4; i++) await login("priya@asharesins.com", "wrong");
    expect((await login("priya@asharesins.com", "staff-password")).statusCode).toBe(200);
    redisMod.inMemoryLoginLimiter.reset();
    for (let i = 0; i < 4; i++) {
      expect((await login("priya@asharesins.com", "wrong")).statusCode).toBe(401);
    }
  });

  it("rate limit is checked before any DB or argon2 work", async () => {
    for (let i = 0; i < 5; i++) await login("nobody@example.com", "x");
    vi.mocked(argon2.verify).mockClear();
    const res = await login("nobody@example.com", "x");
    expect(res.statusCode).toBe(429);
    expect(argon2.verify).not.toHaveBeenCalled();
  });
});

// ─── M1: enumeration resistance ──────────────────────────────────────────────

describe("M1: login does not reveal which accounts exist", () => {
  it("still runs argon2.verify (against a dummy argon2id hash) for an unknown email", async () => {
    const res = await login("nobody@example.com", "whatever");
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
    expect(argon2.verify).toHaveBeenCalledTimes(1);
    const [hashArg] = vi.mocked(argon2.verify).mock.calls[0]!;
    expect(hashArg).toMatch(/^\$argon2id\$/);
  });

  it("deactivated user with a wrong password gets 401, with the right password 403", async () => {
    store.users[1].active = false;
    const wrong = await login("priya@asharesins.com", "nope");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe("INVALID_CREDENTIALS");

    const right = await login("priya@asharesins.com", "staff-password");
    expect(right.statusCode).toBe(403);
    expect(right.json()).toEqual({ error: "Account deactivated", code: "ACCOUNT_DEACTIVATED" });
  });

  it("normalizes email (trim + lowercase) before lookup", async () => {
    const res = await login("  ASHA@AshaResins.COM ", "admin-password");
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe("admin-1");
  });
});

// ─── M6: tokens never reach logs ─────────────────────────────────────────────

describe("M6: logger redaction", () => {
  it("req serializer strips the token query param and never includes headers", async () => {
    const { serializers } = await import("../src/lib/logger.ts");
    const out = serializers.req({
      method: "GET",
      url: "/ws?token=eyJhbGciOi.secret.sig&x=1",
      headers: { authorization: "Bearer abc", cookie: "sid=1" },
    } as any);
    expect(out.url).toBe("/ws?token=[redacted]&x=1");
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(JSON.stringify(out)).not.toContain("Bearer");
    expect(JSON.stringify(out)).not.toContain("sid=1");
  });

  it("Fastify request logs built from loggerOptions do not contain the JWT", async () => {
    const { loggerOptions } = await import("../src/lib/logger.ts");
    const { pino } = await import("pino");
    const Fastify = (await import("fastify")).default;
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { transport: _t, ...opts } = loggerOptions as any;
    const logApp = Fastify({ loggerInstance: pino({ ...opts, level: "info" }, stream) });
    logApp.get("/ws", async () => ({ ok: true }));
    await logApp.inject({
      method: "GET",
      url: "/ws?token=super.secret.jwt",
      headers: { authorization: "Bearer super.secret.jwt", cookie: "session=abc" },
    });
    await logApp.close();
    const logged = lines.join("");
    expect(logged).toContain("/ws?token=[redacted]");
    expect(logged).not.toContain("super.secret.jwt");
    expect(logged).not.toContain("session=abc");
  });
});

// ─── Users responses ─────────────────────────────────────────────────────────

describe("users routes response shape", () => {
  const adminAuth = () => ({ authorization: `Bearer ${sign("admin-1", "admin")}` });

  it("POST /users lowercases email and returns public fields only", async () => {
    const res = await app.inject({
      method: "POST", url: "/users", headers: adminAuth(),
      payload: { name: "Deepa", email: "  Deepa@AshaResins.COM ", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    const { user } = res.json();
    expect(user).toEqual({
      id: expect.any(String),
      name: "Deepa",
      email: "deepa@asharesins.com",
      role: "staff",
      active: true,
      lastLoginAt: null,
      createdAt: expect.any(String),
    });
    expect(res.body).not.toContain("passwordHash");
    expect(res.body).not.toContain("$argon2");
  });

  it("PATCH /users/:id returns lastLoginAt/createdAt and no passwordHash", async () => {
    const res = await app.inject({
      method: "PATCH", url: "/users/staff-1", headers: adminAuth(),
      payload: { active: false },
    });
    expect(res.statusCode).toBe(200);
    const { user } = res.json();
    expect(user).toMatchObject({ id: "staff-1", active: false, lastLoginAt: null, role: "staff" });
    expect(user.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(user).not.toHaveProperty("passwordHash");
  });
});

// ─── /health ─────────────────────────────────────────────────────────────────

describe("/health", () => {
  it("returns 200 ok when the DB answers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: "demo" });
    expect(res.json().timestamp).toBeDefined();
  });

  it("returns 503 ok:false when the DB query fails", async () => {
    store.dbDown = true;
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, mode: "demo" });
    expect(res.json().timestamp).toBeDefined();
  });
});
