// Shared valid env for tests. Must be applied before importing src modules,
// because src/config.ts validates process.env at import time.
export const validEnv: Record<string, string> = {
  PORT: "3001",
  NODE_ENV: "test",
  DEMO_MODE: "true",
  JWT_SECRET: "x".repeat(64),
  JWT_EXPIRES_IN: "7d",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  ENCRYPTION_KEY: "a".repeat(64),
  BUSINESS_ID: "test-business",
};

export function applyTestEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, validEnv, overrides);
}
