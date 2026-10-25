import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv({
  DEMO_MODE: "true",
  INSTAGRAM_LIVE: "true",
  INSTAGRAM_ACCESS_TOKEN: "env-ig-token",
  INSTAGRAM_ACCOUNT_ID: "17841400000000000",
  INSTAGRAM_APP_SECRET: "ig-app-secret",
  META_VERIFY_TOKEN: "verify",
});

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { fake } = await import("./fakeDb.ts");
const { checkAndRefreshInstagramTokens, REFRESH_WHEN_EXPIRING_WITHIN_DAYS } = await import("../src/queue/jobs/refreshTokens.ts");
const { decrypt, encrypt } = await import("../src/lib/crypto.ts");
const { logger } = await import("../src/lib/logger.ts");

const NOW = new Date("2026-10-25T03:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.reset();
  fetchMock = vi.fn(async () => json({ access_token: "fresh-token", token_type: "bearer", expires_in: 60 * 24 * 60 * 60 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const allLogs = (spies: Array<ReturnType<typeof vi.spyOn>>) => JSON.stringify(spies.map((s) => s.mock.calls));

describe("checkAndRefreshInstagramTokens (Instagram live)", () => {
  it("seeds the channel from INSTAGRAM_ACCESS_TOKEN, stores the refreshed token encrypted, audits, never logs tokens", async () => {
    const spies = [vi.spyOn(logger, "info"), vi.spyOn(logger, "warn"), vi.spyOn(logger, "error")];

    const count = await checkAndRefreshInstagramTokens(NOW);

    expect(count).toBe(1);
    const [channel] = fake.rows("channels");
    expect(channel).toMatchObject({ businessId: "test-business", type: "instagram", identifier: "17841400000000000" });
    expect(channel.encryptedToken).not.toContain("fresh-token");
    expect(decrypt(channel.encryptedToken)).toBe("fresh-token");
    expect(channel.tokenExpiresAt).toEqual(new Date(NOW.getTime() + 60 * DAY));

    // Refreshed the env token.
    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get("access_token")).toBe("env-ig-token");

    expect(fake.rows("audit_log")).toEqual([
      expect.objectContaining({
        actorType: "system",
        actorId: null,
        action: "channel_token_refreshed",
        details: expect.objectContaining({ channelId: channel.id, seededFromEnv: true }),
      }),
    ]);
    const logs = allLogs(spies);
    expect(logs).not.toContain("fresh-token");
    expect(logs).not.toContain("env-ig-token");
    expect(JSON.stringify(fake.rows("audit_log"))).not.toContain("fresh-token");
  });

  it("refreshes the stored token when it expires within the window, and skips fresh ones", async () => {
    fake.reset({
      channels: [
        {
          id: "chan-due",
          businessId: "test-business",
          type: "instagram",
          identifier: "17841400000000000",
          status: "active",
          encryptedToken: encrypt("stored-token"),
          tokenExpiresAt: new Date(NOW.getTime() + 5 * DAY),
        },
        {
          id: "chan-fresh",
          businessId: "biz-2",
          type: "instagram",
          identifier: "other",
          status: "active",
          encryptedToken: encrypt("other-token"),
          tokenExpiresAt: new Date(NOW.getTime() + (REFRESH_WHEN_EXPIRING_WITHIN_DAYS + 10) * DAY),
        },
      ],
    });

    const count = await checkAndRefreshInstagramTokens(NOW);

    expect(count).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get("access_token")).toBe("stored-token");
    const [due, fresh] = fake.rows("channels");
    expect(decrypt(due.encryptedToken)).toBe("fresh-token");
    expect(decrypt(fresh.encryptedToken)).toBe("other-token");
    expect(fake.rows("audit_log")[0]).toMatchObject({ businessId: "test-business", action: "channel_token_refreshed" });
  });

  it("on Meta failure keeps the old token and audits channel_token_refresh_failed", async () => {
    const stored = encrypt("stored-token");
    fake.reset({
      channels: [
        { id: "chan-ig", businessId: "test-business", type: "instagram", identifier: "x", status: "active", encryptedToken: stored, tokenExpiresAt: null },
      ],
    });
    fetchMock.mockResolvedValue(
      json({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } }, 400),
    );
    const error = vi.spyOn(logger, "error");

    const count = await checkAndRefreshInstagramTokens(NOW);

    expect(count).toBe(0);
    expect(fake.rows("channels")[0].encryptedToken).toBe(stored);
    expect(fake.rows("audit_log")).toEqual([
      expect.objectContaining({
        actorType: "system",
        action: "channel_token_refresh_failed",
        details: expect.objectContaining({ channelId: "chan-ig", code: "META_TOKEN_INVALID" }),
      }),
    ]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("stored-token");
  });
});
