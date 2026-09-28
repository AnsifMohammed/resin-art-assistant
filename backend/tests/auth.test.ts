import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

let mockUser: {
  id: string;
  businessId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "staff";
  active: boolean;
  lastLoginAt: Date | null;
} | null = null;

let updatedLastLogin = false;

vi.mock("../src/db/index.ts", () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(mockUser ? [mockUser] : []),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            updatedLastLogin = true;
            return Promise.resolve();
          },
        }),
      }),
    },
    schema: {},
    sql: { end: vi.fn() },
  };
});

let buildServer: typeof import("../src/index.ts").buildServer;
let inMemoryLoginLimiter: typeof import("../src/lib/redis.ts").inMemoryLoginLimiter;
let inMemoryLoginEmailLimiter: typeof import("../src/lib/redis.ts").inMemoryLoginEmailLimiter;
let clearUserStatusCache: typeof import("../src/lib/userStatus.ts").clearUserStatusCache;
let app: Awaited<ReturnType<typeof buildServer>>;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await argon2.hash("correct-password", { type: argon2.argon2id });
  const indexMod = await import("../src/index.ts");
  const redisMod = await import("../src/lib/redis.ts");
  buildServer = indexMod.buildServer;
  inMemoryLoginLimiter = redisMod.inMemoryLoginLimiter;
  inMemoryLoginEmailLimiter = redisMod.inMemoryLoginEmailLimiter;
  clearUserStatusCache = (await import("../src/lib/userStatus.ts")).clearUserStatusCache;
  app = await buildServer();
  await app.ready();
});

beforeEach(() => {
  inMemoryLoginLimiter.reset();
  inMemoryLoginEmailLimiter.reset();
  clearUserStatusCache();
  updatedLastLogin = false;
  mockUser = {
    id: "user-asha-1",
    businessId: "biz-asha",
    name: "Asha",
    email: "asha@asharesins.com",
    passwordHash,
    role: "admin",
    active: true,
    lastLoginAt: null,
  };
});

describe("POST /auth/login", () => {
  it("rejects invalid email or empty password with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "not-an-email", password: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when email is not found", async () => {
    mockUser = null;

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "unknown@example.com", password: "some-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 403 when user account is deactivated", async () => {
    mockUser!.active = false;

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "asha@asharesins.com", password: "correct-password" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
    expect(res.json().error).toBe("Account deactivated");
  });

  it("returns 401 when password does not match", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "asha@asharesins.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("returns token and user info on valid credentials and updates lastLoginAt", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "asha@asharesins.com", password: "correct-password" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user).toEqual({
      id: "user-asha-1",
      name: "Asha",
      email: "asha@asharesins.com",
      role: "admin",
      businessId: "biz-asha",
    });
    expect(updatedLastLogin).toBe(true);
  });

  it("rate limits after 5 attempts from the same IP (returns 429 and Retry-After header)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-forwarded-for": "198.51.100.1" },
        payload: { email: "asha@asharesins.com", password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
    }

    const blockedRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-forwarded-for": "198.51.100.1" },
      payload: { email: "asha@asharesins.com", password: "wrong" },
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers["retry-after"]).toBeDefined();
    expect(blockedRes.json().code).toBe("RATE_LIMITED");
  });
});

describe("GET /auth/me", () => {
  it("rejects unauthorized request with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHORIZED");
  });

  it("returns current user from valid JWT", async () => {
    const token = app.jwt.sign({
      sub: "user-asha-1",
      businessId: "biz-asha",
      role: "admin",
      name: "Asha",
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user).toEqual({
      id: "user-asha-1",
      businessId: "biz-asha",
      role: "admin",
      name: "Asha",
      email: "asha@asharesins.com",
    });
  });

  it("rejects deactivated user with 403", async () => {
    mockUser!.active = false;

    const deactivatedToken = app.jwt.sign({
      sub: "user-deactivated",
      businessId: "biz-asha",
      role: "staff",
      name: "Inactive Staff",
    });

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${deactivatedToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });
});

describe("POST /auth/logout", () => {
  it("returns ok true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
