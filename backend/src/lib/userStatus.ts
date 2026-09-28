import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { AppError } from "./errors.ts";

// Short-lived cache of { active, businessId } per user id so every
// authenticated request doesn't hit the DB. Deactivation calls
// invalidateUserStatus() so it takes effect immediately on this instance;
// other instances pick it up within CACHE_TTL_MS.
const CACHE_TTL_MS = 30_000;

interface UserStatus {
  exists: boolean;
  active: boolean;
  businessId: string | null;
}

const cache = new Map<string, { status: UserStatus; expiresAt: number }>();

async function loadUserStatus(userId: string): Promise<UserStatus> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const [row] = await db
    .select({ active: users.active, businessId: users.businessId })
    .from(users)
    .where(eq(users.id, userId));

  const status: UserStatus = row
    ? { exists: true, active: row.active === true, businessId: row.businessId ?? null }
    : { exists: false, active: false, businessId: null };

  cache.set(userId, { status, expiresAt: Date.now() + CACHE_TTL_MS });
  return status;
}

export type UserStatusCheck =
  | { ok: true }
  | { ok: false; statusCode: 401 | 403; message: string; code: "ACCOUNT_DEACTIVATED" };

/** Verify a JWT subject still maps to an active user in the JWT's business. */
export async function checkUserStatus(userId: string, businessId: string): Promise<UserStatusCheck> {
  const status = await loadUserStatus(userId);
  if (!status.exists) {
    return { ok: false, statusCode: 401, message: "Account not found", code: "ACCOUNT_DEACTIVATED" };
  }
  if (status.businessId !== businessId) {
    return { ok: false, statusCode: 401, message: "Account not found", code: "ACCOUNT_DEACTIVATED" };
  }
  if (!status.active) {
    return { ok: false, statusCode: 403, message: "Account deactivated", code: "ACCOUNT_DEACTIVATED" };
  }
  return { ok: true };
}

/** Throwing variant for HTTP handlers. */
export async function assertUserActive(userId: string, businessId: string): Promise<void> {
  const result = await checkUserStatus(userId, businessId);
  if (!result.ok) throw new AppError(result.statusCode, result.message, result.code);
}

export function invalidateUserStatus(userId: string): void {
  cache.delete(userId);
}

export function clearUserStatusCache(): void {
  cache.clear();
}
