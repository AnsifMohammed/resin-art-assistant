import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// config is validated at import time, so live mode needs its own test file.
applyTestEnv({
  DEMO_MODE: "false",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-secret",
  META_VERIFY_TOKEN: "test-verify",
  INSTAGRAM_ACCESS_TOKEN: "test-ig-token",
  INSTAGRAM_ACCOUNT_ID: "test-ig-account",
  INSTAGRAM_APP_SECRET: "test-ig-secret",
  WHATSAPP_TOKEN: "test-wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "test-wa-phone",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "test-wa-business",
});

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { fake } = await import("./fakeDb.ts");
const { config } = await import("../src/config.ts");
const { sendMessage } = await import("../src/services/send.ts");
const { AppError } = await import("../src/lib/errors.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  fake.reset();
});

describe("sendMessage (live mode)", () => {
  it("WhatsApp still throws 501 LIVE_SEND_NOT_IMPLEMENTED instead of silently succeeding", async () => {
    expect(config.DEMO_MODE).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const attempt = sendMessage({
      channelType: "whatsapp",
      recipient: "+919876543210",
      text: "hello",
      businessId: "biz-1",
      conversationId: "conv-1",
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 501, code: "LIVE_SEND_NOT_IMPLEMENTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Instagram is sent through graph.instagram.com and returns Meta's message id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ recipient_id: "igsid-1", message_id: "mid.live.1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendMessage({
      channelType: "instagram",
      recipient: "igsid-1",
      text: "hello",
      businessId: "test-business",
      conversationId: "conv-1",
    });
    expect(result).toEqual({ metaMessageId: "mid.live.1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/graph\.instagram\.com\/v\d+\.\d+\/me\/messages$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-ig-token");
  });
});
