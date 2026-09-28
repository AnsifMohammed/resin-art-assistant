import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { loginEmailRatelimit, loginRatelimit } from "../lib/redis.ts";
import { authenticate } from "../middleware/authenticate.ts";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// A real argon2id hash of a random secret, computed once (lazily). When the
// email is unknown we still run argon2.verify against it so response timing
// does not reveal which accounts exist.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
  return dummyHashPromise;
}

function rateLimited(reply: FastifyReply, reset: number): AppError {
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  reply.header("Retry-After", String(retryAfterSeconds));
  return new AppError(429, "Too many login attempts. Try again in a few minutes.", "RATE_LIMITED");
}

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/auth/login", async (request, reply) => {
    // Per-IP limit first, before parsing or touching the DB.
    const ip = request.ip ?? "unknown";
    const ipLimit = await loginRatelimit.limit(ip);
    if (!ipLimit.success) throw rateLimited(reply, ipLimit.reset);

    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(400, "Invalid email or password format", "VALIDATION_ERROR");
    }

    const { email, password } = parseResult.data;

    // Per-account limit, independent of source IP.
    const emailLimit = await loginEmailRatelimit.limit(email);
    if (!emailLimit.success) throw rateLimited(reply, emailLimit.reset);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    // Always run argon2.verify, even for unknown emails.
    const hash = user?.passwordHash ?? (await getDummyHash());
    let valid = false;
    try {
      valid = await argon2.verify(hash, password);
    } catch {
      valid = false;
    }

    if (!user || !valid) {
      throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    // Only reveal deactivation once the password is proven correct.
    if (!user.active) {
      throw new AppError(403, "Account deactivated", "ACCOUNT_DEACTIVATED");
    }

    // The account owner proved the password: clear their per-account bucket.
    // (The per-IP bucket is not refunded; the limiter only supports a full
    // reset, which would let one valid account wipe an attacker's IP bucket.)
    await loginEmailRatelimit.resetIdentifier(email);

    const token = app.jwt.sign({
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
      name: user.name,
    });

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
      },
    };
  });

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.user.sub));

    if (!user || !user.active) {
      throw new AppError(403, "Account deactivated", "ACCOUNT_DEACTIVATED");
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
      },
    };
  });

  app.post("/auth/logout", async () => {
    return { ok: true };
  });
};
