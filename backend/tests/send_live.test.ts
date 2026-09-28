import { describe, expect, it } from "vitest";
import { applyTestEnv } from "./env.ts";

// config is validated at import time, so live mode needs its own test file.
applyTestEnv({
  DEMO_MODE: "false",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-secret",
  META_VERIFY_TOKEN: "test-verify",
  INSTAGRAM_ACCESS_TOKEN: "test-ig-token",
  INSTAGRAM_ACCOUNT_ID: "test-ig-account",
  WHATSAPP_TOKEN: "test-wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "test-wa-phone",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "test-wa-business",
});

const { config } = await import("../src/config.ts");
const { sendMessage } = await import("../src/services/send.ts");
const { AppError } = await import("../src/lib/errors.ts");

describe("sendMessage (live mode)", () => {
  it("throws 501 LIVE_SEND_NOT_IMPLEMENTED instead of silently succeeding", async () => {
    expect(config.DEMO_MODE).toBe(false);
    const attempt = sendMessage({
      channelType: "whatsapp",
      recipient: "+919876543210",
      text: "hello",
      businessId: "biz-1",
      conversationId: "conv-1",
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 501, code: "LIVE_SEND_NOT_IMPLEMENTED" });
  });
});
