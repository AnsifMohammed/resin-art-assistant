// Shared valid env for tests. Must be applied before importing src modules,
// because src/config.ts validates process.env at import time.
export const validEnv: Record<string, string> = {
  PORT: "3001",
  NODE_ENV: "test",
  DEMO_MODE: "true",
  JWT_SECRET: "x".repeat(64),
  JWT_EXPIRES_IN: "7d",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  GEMINI_API_KEY: "AIza-test-key-for-gemini-API",
  ENCRYPTION_KEY: "a".repeat(64),
  BUSINESS_ID: "test-business",
  // Pin live-channel settings so a developer's real backend/.env (loaded by dotenv) can't leak in.
  INSTAGRAM_LIVE: "false",
  INSTAGRAM_ACCESS_TOKEN: "",
  INSTAGRAM_ACCOUNT_ID: "",
  INSTAGRAM_APP_ID: "",
  INSTAGRAM_APP_SECRET: "",
};

export function applyTestEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, validEnv, overrides);
}
