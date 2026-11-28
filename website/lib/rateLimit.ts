/**
 * Rate Limiter for Saba Art Storefront.
 * Enforces 10 lookup attempts per phone number per hour.
 */

interface RateLimitRecord {
  attempts: number[];
}

const lookupAttempts = new Map<string, RateLimitRecord>();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function checkLookupRateLimit(phone: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const cleanPhone = phone.replace(/\D/g, "");
  const now = Date.now();
  const record = lookupAttempts.get(cleanPhone) || { attempts: [] };

  // Filter out attempts older than 1 hour
  const recentAttempts = record.attempts.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    const oldest = recentAttempts[0] || now;
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  recentAttempts.push(now);
  lookupAttempts.set(cleanPhone, { attempts: recentAttempts });

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - recentAttempts.length,
  };
}
