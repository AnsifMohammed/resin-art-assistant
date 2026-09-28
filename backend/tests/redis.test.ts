import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyTestEnv } from "./env.ts";

let redisModule: typeof import("../src/lib/redis.ts");

beforeAll(async () => {
  applyTestEnv();
  redisModule = await import("../src/lib/redis.ts");
});

beforeEach(() => {
  redisModule.inMemoryRedisInstance.clear();
  redisModule.inMemoryLoginLimiter.reset();
  redisModule.inMemoryLoginEmailLimiter.reset();
  redisModule.inMemoryApiLimiter.reset();
});

describe("in-memory Redis fallback", () => {
  it("stores and retrieves objects via setex and get", async () => {
    const data = { title: "Resin Clock", price: 1500 };
    await redisModule.redis.setex("test:item", 60, JSON.stringify(data));

    const retrieved = await redisModule.redis.get<{ title: string; price: number }>("test:item");
    expect(retrieved).toEqual(data);
  });

  it("deletes keys with del", async () => {
    await redisModule.redis.setex("test:delete", 60, "val");
    const count = await redisModule.redis.del("test:delete");
    expect(count).toBe(1);

    const check = await redisModule.redis.get("test:delete");
    expect(check).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to 5 login requests and blocks the 6th", async () => {
    const ip = "192.168.1.100";

    for (let i = 1; i <= 5; i++) {
      const res = await redisModule.loginRatelimit.limit(ip);
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(5 - i);
    }

    const blocked = await redisModule.loginRatelimit.limit(ip);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  it("tracks different IPs separately", async () => {
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";

    for (let i = 0; i < 5; i++) {
      await redisModule.loginRatelimit.limit(ip1);
    }

    const blocked1 = await redisModule.loginRatelimit.limit(ip1);
    expect(blocked1.success).toBe(false);

    const allowed2 = await redisModule.loginRatelimit.limit(ip2);
    expect(allowed2.success).toBe(true);
  });
});

describe("per-email login limiter", () => {
  it("is independent of the per-IP limiter and blocks the 6th attempt", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await redisModule.loginEmailRatelimit.limit("a@b.com")).success).toBe(true);
    }
    expect((await redisModule.loginEmailRatelimit.limit("a@b.com")).success).toBe(false);
    // IP bucket untouched
    expect((await redisModule.loginRatelimit.limit("a@b.com")).success).toBe(true);
  });

  it("resetIdentifier clears one identifier only", async () => {
    for (let i = 0; i < 5; i++) {
      await redisModule.loginEmailRatelimit.limit("x@y.com");
      await redisModule.loginEmailRatelimit.limit("z@y.com");
    }
    await redisModule.loginEmailRatelimit.resetIdentifier("x@y.com");
    expect((await redisModule.loginEmailRatelimit.limit("x@y.com")).success).toBe(true);
    expect((await redisModule.loginEmailRatelimit.limit("z@y.com")).success).toBe(false);
  });
});
