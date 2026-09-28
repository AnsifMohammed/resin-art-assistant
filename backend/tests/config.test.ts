import { beforeAll, describe, expect, it } from "vitest";
import { applyTestEnv, validEnv } from "./env.ts";

let mod: typeof import("../src/config.ts");

beforeAll(async () => {
  applyTestEnv();
  mod = await import("../src/config.ts");
});

describe("config validation", () => {
  it("parses a valid demo env and applies defaults and coercion", () => {
    const cfg = mod.parseEnv(validEnv);
    expect(cfg.PORT).toBe(3001);
    expect(cfg.DEMO_MODE).toBe(true);
    expect(cfg.ANTHROPIC_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(cfg.META_APP_ID).toBeUndefined();
  });

  it("coerces DEMO_MODE=false to boolean false", () => {
    const live = Object.fromEntries(mod.LIVE_ONLY_VARS.map((k) => [k, "value"]));
    const cfg = mod.parseEnv({ ...validEnv, ...live, DEMO_MODE: "false" });
    expect(cfg.DEMO_MODE).toBe(false);
  });

  it("lists every missing required var", () => {
    try {
      mod.parseEnv({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(mod.ConfigError);
      const issues = (err as InstanceType<typeof mod.ConfigError>).issues.join("\n");
      for (const key of ["PORT", "NODE_ENV", "DEMO_MODE", "JWT_SECRET", "DATABASE_URL", "ENCRYPTION_KEY", "BUSINESS_ID"]) {
        expect(issues).toContain(`${key}: missing`);
      }
    }
  });

  it("rejects a short JWT_SECRET and a non-hex ENCRYPTION_KEY", () => {
    expect(() => mod.parseEnv({ ...validEnv, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
    expect(() => mod.parseEnv({ ...validEnv, ENCRYPTION_KEY: "z".repeat(64) })).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects an invalid DEMO_MODE value", () => {
    expect(() => mod.parseEnv({ ...validEnv, DEMO_MODE: "yes" })).toThrow(/DEMO_MODE/);
  });

  it("treats empty strings as unset", () => {
    expect(() => mod.parseEnv({ ...validEnv, BUSINESS_ID: "" })).toThrow(/BUSINESS_ID: missing/);
    expect(mod.parseEnv({ ...validEnv, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
  });

  it("requires Meta vars only when DEMO_MODE=false", () => {
    expect(() => mod.parseEnv({ ...validEnv, DEMO_MODE: "false" })).toThrow(
      /WHATSAPP_TOKEN: required when DEMO_MODE=false/,
    );
    expect(() => mod.parseEnv({ ...validEnv, DEMO_MODE: "true" })).not.toThrow();
  });
});

describe("TRUST_PROXY", () => {
  it("defaults to false when unset or empty", () => {
    expect(mod.parseEnv(validEnv).TRUST_PROXY).toBe(false);
    expect(mod.parseEnv({ ...validEnv, TRUST_PROXY: "" }).TRUST_PROXY).toBe(false);
    expect(mod.parseEnv({ ...validEnv, TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
  });

  it("accepts true", () => {
    expect(mod.parseEnv({ ...validEnv, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
  });

  it("turns an integer into a hop-count function (0 = false)", () => {
    const tp = mod.parseEnv({ ...validEnv, TRUST_PROXY: "2" }).TRUST_PROXY;
    expect(typeof tp).toBe("function");
    const fn = tp as (a: string, hop: number) => boolean;
    expect(fn("1.2.3.4", 0)).toBe(true);
    expect(fn("1.2.3.4", 1)).toBe(true);
    expect(fn("1.2.3.4", 2)).toBe(false);
    expect(mod.parseTrustProxy("0")).toBe(false);
  });

  it("accepts a comma-separated IP/CIDR list", () => {
    expect(
      mod.parseEnv({ ...validEnv, TRUST_PROXY: "10.0.0.0/8, 127.0.0.1,::1,fd00::/8,loopback" }).TRUST_PROXY,
    ).toEqual(["10.0.0.0/8", "127.0.0.1", "::1", "fd00::/8", "loopback"]);
  });

  it("rejects garbage values", () => {
    expect(() => mod.parseEnv({ ...validEnv, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
    expect(() => mod.parseEnv({ ...validEnv, TRUST_PROXY: "10.0.0.0/33" })).toThrow(/TRUST_PROXY/);
    expect(() => mod.parseEnv({ ...validEnv, TRUST_PROXY: "10.0.0.1,nope" })).toThrow(/TRUST_PROXY/);
  });
});
