import { describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv({ DEMO_MODE: "true", NODE_ENV: "test" });

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
});
