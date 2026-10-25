import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv({ INSTAGRAM_ACCESS_TOKEN: "env-ig-token", INSTAGRAM_ACCOUNT_ID: "17841400000000000" });

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { fake } = await import("./fakeDb.ts");
const ig = await import("../src/services/meta/instagram.ts");
const { encrypt } = await import("../src/lib/crypto.ts");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const metaError = (code: number, subcode?: number, status = 400) =>
  json({ error: { message: `meta says ${code}`, type: "OAuthException", code, error_subcode: subcode, fbtrace_id: "trace-1" } }, status);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.reset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const call = (i = 0) => fetchMock.mock.calls[i] as unknown as [string, RequestInit];

describe("sendInstagramText", () => {
  it("POSTs { recipient, message } to graph.instagram.com/<version>/me/messages with a Bearer token", async () => {
    fetchMock.mockResolvedValue(json({ recipient_id: "igsid-1", message_id: "mid.1" }));
    const res = await ig.sendInstagramText({ recipientId: "igsid-1", text: "Hi! 😊" });

    expect(res).toEqual({ metaMessageId: "mid.1", metaMessageIds: ["mid.1"] });
    const [url, init] = call();
    expect(url).toBe(`https://graph.instagram.com/${ig.INSTAGRAM_GRAPH_VERSION}/me/messages`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer env-ig-token", "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { id: "igsid-1" }, message: { text: "Hi! 😊" } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(url).not.toContain("access_token");
  });

  it("prefers the channel's encrypted token over INSTAGRAM_ACCESS_TOKEN", async () => {
    fake.reset({
      channels: [{ id: "chan-ig", businessId: "test-business", type: "instagram", encryptedToken: encrypt("db-ig-token") }],
    });
    fetchMock.mockResolvedValue(json({ message_id: "mid.2" }));
    await ig.sendInstagramText({ recipientId: "igsid-1", text: "hi" });
    expect((call()[1].headers as Record<string, string>).Authorization).toBe("Bearer db-ig-token");
  });

  it("refuses a business without a token (503 INSTAGRAM_NOT_CONFIGURED)", async () => {
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "hi", businessId: "other-business" })).rejects.toMatchObject({
      statusCode: 503,
      code: "INSTAGRAM_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("splits text over 1000 UTF-8 bytes into several messages and returns the first id", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => json({ message_id: `mid.part.${++n}` }));
    const malayalam = "എത്ര രൂപ കൊടുക്കണം ".repeat(40); // ~3 bytes per char
    const res = await ig.sendInstagramText({ recipientId: "igsid-1", text: malayalam });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(res.metaMessageId).toBe("mid.part.1");
    expect(res.metaMessageIds).toHaveLength(fetchMock.mock.calls.length);
    const sent = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).message.text as string);
    for (const part of sent) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(1000);
    expect(sent.join(" ")).toBe(malayalam);
  });

  it("reports a partial send when a later part fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ message_id: "mid.a" })).mockResolvedValueOnce(metaError(2, undefined, 500));
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "word ".repeat(400) })).rejects.toMatchObject({
      code: "META_PARTIAL_SEND",
      details: { sentChunks: 1, metaMessageIds: ["mid.a"] },
    });
  });

  it("maps a timeout to 504 META_TIMEOUT and a network failure to 502 META_UNREACHABLE", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "hi" })).rejects.toMatchObject({ statusCode: 504, code: "META_TIMEOUT" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "hi" })).rejects.toMatchObject({ statusCode: 502, code: "META_UNREACHABLE" });
  });

  it("rejects a 200 response without message_id", async () => {
    fetchMock.mockResolvedValue(json({ recipient_id: "igsid-1" }));
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "hi" })).rejects.toMatchObject({ code: "META_ERROR" });
  });
});

describe("Meta error mapping", () => {
  const cases: Array<[Response, number, string]> = [
    [metaError(190, 463), 502, "META_TOKEN_INVALID"],
    [metaError(10, 2534022), 409, "WINDOW_CLOSED"],
    [metaError(551, 1545041), 409, "RECIPIENT_UNAVAILABLE"],
    [metaError(100, 2018001), 409, "RECIPIENT_UNAVAILABLE"],
    [metaError(4), 503, "META_RATE_LIMITED"],
    [metaError(100, 33), 502, "META_ERROR"],
    [new Response("<html>bad gateway</html>", { status: 502 }), 502, "META_ERROR"],
  ];

  it.each(cases)("maps Meta error %# to the right AppError", async (response, status, code) => {
    fetchMock.mockResolvedValue(response);
    await expect(ig.sendInstagramText({ recipientId: "igsid-1", text: "hi", accessToken: "tok" })).rejects.toMatchObject({
      statusCode: status,
      code,
    });
  });

  it("keeps Meta's code, subcode, message and trace id in details, never the token", () => {
    const err = ig.mapMetaError(400, { error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190, fbtrace_id: "t" } });
    expect(err.details).toEqual({
      metaStatus: 400,
      metaCode: 190,
      metaSubcode: null,
      metaType: "OAuthException",
      metaMessage: "Invalid OAuth access token",
      fbtraceId: "t",
    });
  });
});

describe("refreshInstagramToken", () => {
  it("GETs refresh_access_token with grant_type=ig_refresh_token and returns the new token + expiry", async () => {
    fetchMock.mockResolvedValue(json({ access_token: "new-token", token_type: "bearer", expires_in: 5183944 }));
    const now = new Date("2026-10-25T00:00:00Z");
    const res = await ig.refreshInstagramToken("old-token", now);

    const url = new URL(call()[0]);
    expect(`${url.origin}${url.pathname}`).toBe("https://graph.instagram.com/refresh_access_token");
    expect(url.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(url.searchParams.get("access_token")).toBe("old-token");
    expect(call()[1].method).toBe("GET");
    expect(res).toEqual({ accessToken: "new-token", expiresIn: 5183944, expiresAt: new Date(now.getTime() + 5183944 * 1000) });
  });

  it("maps an expired token to META_TOKEN_INVALID and rejects a malformed response", async () => {
    fetchMock.mockResolvedValueOnce(metaError(190, 463));
    await expect(ig.refreshInstagramToken("old")).rejects.toMatchObject({ code: "META_TOKEN_INVALID" });
    fetchMock.mockResolvedValueOnce(json({ token_type: "bearer" }));
    await expect(ig.refreshInstagramToken("old")).rejects.toMatchObject({ code: "META_ERROR" });
  });
});

describe("splitInstagramText", () => {
  it("returns short text unchanged and never splits inside a code point", () => {
    expect(ig.splitInstagramText("hello")).toEqual(["hello"]);
    const emoji = "😊".repeat(300); // 4 bytes each, no spaces
    const parts = ig.splitInstagramText(emoji);
    expect(parts.join("")).toBe(emoji);
    for (const p of parts) {
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(1000);
      expect(p).not.toMatch(/[\uD800-\uDBFF]$/);
    }
  });
});

describe("fetchInstagramDisplayName", () => {
  it("returns 'Name (@username)' from the profile API", async () => {
    fetchMock.mockResolvedValue(json({ name: "Vj Allan", username: "vj_allan05", id: "2201" }));
    await expect(ig.fetchInstagramDisplayName("2201")).resolves.toBe("Vj Allan (@vj_allan05)");
    const [url, init] = call();
    expect(url).toContain("/2201?fields=name,username");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer env-ig-token");
  });

  it("falls back to @username or name", async () => {
    fetchMock.mockResolvedValueOnce(json({ username: "only_handle" }));
    await expect(ig.fetchInstagramDisplayName("1")).resolves.toBe("@only_handle");
    fetchMock.mockResolvedValueOnce(json({ name: "Only Name" }));
    await expect(ig.fetchInstagramDisplayName("2")).resolves.toBe("Only Name");
  });

  it("returns null instead of throwing on Meta errors or network failures", async () => {
    fetchMock.mockResolvedValueOnce(metaError(100, undefined, 400));
    await expect(ig.fetchInstagramDisplayName("3")).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(ig.fetchInstagramDisplayName("4")).resolves.toBeNull();
  });
});
