import { describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// WHATSAPP_TOKEN is set on purpose: holding a token must not, on its own, be
// enough to deliver to real phone numbers while DEMO_MODE=true.
applyTestEnv({
  DEMO_MODE: "true",
  NODE_ENV: "test",
  WHATSAPP_TOKEN: "test-wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "test-wa-phone",
});

const { sendMessage } = await import("../src/services/send.ts");
const { logger } = await import("../src/lib/logger.ts");

describe("sendMessage (demo mode, non-development)", () => {
  it("logs ids and length only, never the message text or recipient", async () => {
    const info = vi.spyOn(logger, "info");
    await sendMessage({
      channelType: "instagram",
      recipient: "secret_handle",
      text: "Very private customer text",
      businessId: "biz-1",
      conversationId: "conv-1",
    });

    expect(info).toHaveBeenCalledOnce();
    const logged = JSON.stringify(info.mock.calls[0]);
    expect(logged).not.toContain("Very private customer text");
    expect(logged).not.toContain("secret_handle");
    expect(logged).toContain("conv-1");
    expect(info.mock.calls[0]![0]).toMatchObject({ textLength: 26, channel: "instagram" });
    info.mockRestore();
  });

  // Regression guard: the live gate once read `!DEMO_MODE || Boolean(WHATSAPP_TOKEN)`,
  // so any environment holding a token messaged real numbers while believing it
  // was in demo mode. Going live now requires WHATSAPP_LIVE=true explicitly.
  it("does not call Meta for WhatsApp when WHATSAPP_TOKEN is set but WHATSAPP_LIVE is not", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage({
      channelType: "whatsapp",
      recipient: "+919876543210",
      text: "hello",
      businessId: "biz-1",
      conversationId: "conv-1",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
