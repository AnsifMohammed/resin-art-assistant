import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { config } from "../config.ts";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending?: Promise<unknown>;
}

export interface RatelimitClient {
  limit(identifier: string): Promise<RateLimitResult>;
  /** Clear all recorded hits for one identifier (e.g. after a successful login). */
  resetIdentifier(identifier: string): Promise<void>;
}

export interface RedisClient {
  get<T = unknown>(key: string): Promise<T | null>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(key: string): Promise<number>;
}

class InMemoryRedis implements RedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  clear(): void {
    this.store.clear();
  }
}

class InMemoryRateLimiter implements RatelimitClient {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limitCount: number,
    private readonly windowMs: number,
  ) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(identifier) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.limitCount) {
      const oldest = timestamps[0] ?? now;
      const reset = oldest + this.windowMs;
      this.hits.set(identifier, timestamps);
      return {
        success: false,
        limit: this.limitCount,
        remaining: 0,
        reset,
      };
    }

    timestamps.push(now);
    this.hits.set(identifier, timestamps);
    const reset = timestamps[0]! + this.windowMs;
    return {
      success: true,
      limit: this.limitCount,
      remaining: this.limitCount - timestamps.length,
      reset,
    };
  }

  async resetIdentifier(identifier: string): Promise<void> {
    this.hits.delete(identifier);
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Adapts Upstash Ratelimit to RatelimitClient. */
class UpstashRateLimiter implements RatelimitClient {
  constructor(private readonly inner: Ratelimit) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    return this.inner.limit(identifier);
  }

  async resetIdentifier(identifier: string): Promise<void> {
    await this.inner.resetUsedTokens(identifier);
  }
}

const hasUpstash = Boolean(config.UPSTASH_REDIS_URL && config.UPSTASH_REDIS_TOKEN);

export const inMemoryRedisInstance = new InMemoryRedis();
export const inMemoryLoginLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000);
export const inMemoryLoginEmailLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000);
export const inMemoryApiLimiter = new InMemoryRateLimiter(10, 1000);

export const redis: RedisClient = hasUpstash
  ? new Redis({
      url: config.UPSTASH_REDIS_URL!,
      token: config.UPSTASH_REDIS_TOKEN!,
    })
  : inMemoryRedisInstance;

// Per-IP login limiter: 5 attempts per 15 minutes.
export const loginRatelimit: RatelimitClient = hasUpstash
  ? new UpstashRateLimiter(
      new Ratelimit({
        redis: redis as Redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "rl:login",
        analytics: true,
      }),
    )
  : inMemoryLoginLimiter;

// Per-account login limiter (keyed by normalized email): 5 attempts per 15
// minutes, regardless of source IP.
export const loginEmailRatelimit: RatelimitClient = hasUpstash
  ? new UpstashRateLimiter(
      new Ratelimit({
        redis: redis as Redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "rl:login-email",
        analytics: true,
      }),
    )
  : inMemoryLoginEmailLimiter;

export const apiRatelimit: RatelimitClient = hasUpstash
  ? new UpstashRateLimiter(
      new Ratelimit({
        redis: redis as Redis,
        limiter: Ratelimit.slidingWindow(10, "1 s"),
        prefix: "rl:api",
        analytics: true,
      }),
    )
  : inMemoryApiLimiter;
