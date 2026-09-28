import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fjwt from "@fastify/jwt";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// authenticate() looks the user up to confirm the account is still active
// and in the token's business. Every token in this file uses biz-1.
let userRow: { active: boolean; businessId: string } | null = { active: true, businessId: "biz-1" };

vi.mock("../src/db/index.ts", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(userRow ? [userRow] : []),
      }),
    }),
  },
  schema: {},
  sql: { end: vi.fn() },
}));
import { errorHandler } from "../src/lib/errors.ts";
import { authenticate } from "../src/middleware/authenticate.ts";
import { requireAdmin } from "../src/middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../src/middleware/requireStaffOrAdmin.ts";
import { clearUserStatusCache } from "../src/lib/userStatus.ts";

let app: FastifyInstance;

beforeAll(async () => {
  applyTestEnv();
  app = Fastify();
  await app.register(fjwt, { secret: "test-secret-that-is-at-least-32-chars-long-123" });
  app.setErrorHandler(errorHandler);

  app.get("/test/protected", { preHandler: [authenticate] }, async (req) => {
    return { user: req.user };
  });

  app.get("/test/admin-only", { preHandler: [authenticate, requireAdmin] }, async (req) => {
    return { message: "admin-ok", user: req.user };
  });

  app.get("/test/staff-or-admin", { preHandler: [authenticate, requireStaffOrAdmin] }, async (req) => {
    return { message: "staff-or-admin-ok", user: req.user };
  });

  await app.ready();
});

beforeEach(() => {
  clearUserStatusCache();
  userRow = { active: true, businessId: "biz-1" };
});

describe("authenticate middleware", () => {
  it("rejects request without Authorization header with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.error).toContain("Missing or invalid authorization header");
  });

  it("rejects request with invalid token format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: "Bearer invalid.jwt.token" },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("authenticates valid token and attaches user to request", async () => {
    const token = app.jwt.sign({
      sub: "u123",
      businessId: "biz-1",
      role: "admin",
      name: "Asha",
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.sub).toBe("u123");
    expect(body.user.role).toBe("admin");
  });
});

describe("requireAdmin middleware", () => {
  it("allows access for admin role", async () => {
    const adminToken = app.jwt.sign({
      sub: "u1",
      businessId: "biz-1",
      role: "admin",
      name: "Asha",
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/admin-only",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("admin-ok");
  });

  it("returns 403 when staff tries to access admin-only route", async () => {
    const staffToken = app.jwt.sign({
      sub: "u2",
      businessId: "biz-1",
      role: "staff",
      name: "Priya",
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/admin-only",
      headers: { authorization: `Bearer ${staffToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error).toBe("Admin access required");
  });
});

describe("requireStaffOrAdmin middleware", () => {
  it("allows admin", async () => {
    const token = app.jwt.sign({
      sub: "u1",
      businessId: "biz-1",
      role: "admin",
      name: "Asha",
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/staff-or-admin",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("allows staff", async () => {
    const token = app.jwt.sign({
      sub: "u2",
      businessId: "biz-1",
      role: "staff",
      name: "Priya",
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/staff-or-admin",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("authenticate: account status", () => {
  const sign = () =>
    app.jwt.sign({ sub: "u-status", businessId: "biz-1", role: "staff", name: "Priya" });

  it("rejects a valid token for a deactivated user with 403 ACCOUNT_DEACTIVATED", async () => {
    userRow = { active: false, businessId: "biz-1" };
    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${sign()}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects a valid token for a user that no longer exists with 401", async () => {
    userRow = null;
    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${sign()}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects a token whose businessId does not match the user's business", async () => {
    userRow = { active: true, businessId: "biz-other" };
    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${sign()}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("ACCOUNT_DEACTIVATED");
  });
});
