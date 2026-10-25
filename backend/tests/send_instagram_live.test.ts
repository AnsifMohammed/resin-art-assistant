import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// DEMO_MODE stays on; only Instagram goes live.
applyTestEnv({
  DEMO_MODE: "true",
  NODE_ENV: "production",
  INSTAGRAM_LIVE: "true",
  INSTAGRAM_ACCESS_TOKEN: "env-ig-token",
  INSTAGRAM_ACCOUNT_ID: "17841400000000000",
  INSTAGRAM_APP_SECRET: "ig-app-secret",
  META_VERIFY_TOKEN: "verify",
});

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { fake } = await import("./fakeDb.ts");
const { config, isInstagramLive } = await import("../src/config.ts");
const { sendMessage } = await import("../src/services/send.ts");
const { logger } = await import("../src/lib/logger.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fake.reset();
});

const ok = (mid: string) =>
  vi.fn(async () => new Response(JSON.stringify({ recipient_id: "igsid-1", message_id: mid }), { status: 200 }));

describe("sendMessage with INSTAGRAM_LIVE=true and DEMO_MODE=true", () => {
  it("parses the flag", () => {
    expect(config.DEMO_MODE).toBe(true);
    expect(config.INSTAGRAM_LIVE).toBe(true);
    expect(isInstagramLive(config)).toBe(true);
  });

  it("sends Instagram to Meta and logs ids only (no text, no recipient, no token)", async () => {
    const fetchMock = ok("mid.ig.1");
    vi.stubGlobal("fetch", fetchMock);
    const info = vi.spyOn(logger, "info");

    const result = await sendMessage({
      channelType: "instagram",
      recipient: "igsid-secret",
      text: "Very private reply",
      businessId: "test-business",
      conversationId: "conv-1",
    });

    expect(result).toEqual({ metaMessageId: "mid.ig.1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { id: "igsid-secret" }, message: { text: "Very private reply" } });

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("Very private reply");
    expect(logged).not.toContain("igsid-secret");
    expect(logged).not.toContain("env-ig-token");
    expect(logged).toContain("mid.ig.1");
  });

  it("keeps WhatsApp in demo mode (logged, never sent)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMessage({
      channelType: "whatsapp",
      recipient: "919876543210",
      text: "hello",
      businessId: "test-business",
      conversationId: "conv-1",
    });
    expect(result).toEqual({ metaMessageId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Meta errors as AppErrors (window closed -> 409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { message: "outside of allowed window", type: "OAuthException", code: 10, error_subcode: 2534022 } }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      sendMessage({ channelType: "instagram", recipient: "igsid-1", text: "hi", businessId: "test-business", conversationId: "c" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "WINDOW_CLOSED" });
  });
});
