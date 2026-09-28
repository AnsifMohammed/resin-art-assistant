import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { applyTestEnv } from "./env.ts";

const key = randomBytes(32).toString("hex");
let crypto: typeof import("../src/lib/crypto.ts");

beforeAll(async () => {
  applyTestEnv({ ENCRYPTION_KEY: key });
  crypto = await import("../src/lib/crypto.ts");
});

describe("crypto (AES-256-GCM)", () => {
  it("round-trips plaintext with an explicit key", () => {
    const plain = "EAAG-secret-token ✓ മലയാളം";
    const enc = crypto.encryptWithKey(plain, key);
    expect(enc.split(":")).toHaveLength(3);
    expect(enc).not.toContain(plain);
    expect(crypto.decryptWithKey(enc, key)).toBe(plain);
  });

  it("round-trips using ENCRYPTION_KEY from config", () => {
    expect(crypto.decrypt(crypto.encrypt("hello"))).toBe("hello");
  });

  it("uses a random IV so ciphertexts differ", () => {
    expect(crypto.encryptWithKey("same", key)).not.toBe(crypto.encryptWithKey("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const [iv, tag, data] = crypto.encryptWithKey("secret", key).split(":") as [string, string, string];
    const buf = Buffer.from(data, "base64");
    buf[0] = buf[0]! ^ 0xff;
    expect(() => crypto.decryptWithKey(`${iv}:${tag}:${buf.toString("base64")}`, key)).toThrow();
  });

  it("rejects the wrong key", () => {
    const enc = crypto.encryptWithKey("secret", key);
    expect(() => crypto.decryptWithKey(enc, randomBytes(32).toString("hex"))).toThrow();
  });

  it("rejects malformed payloads and bad keys", () => {
    expect(() => crypto.decryptWithKey("not-valid", key)).toThrow(/Malformed/);
    expect(() => crypto.encryptWithKey("x", "short")).toThrow(/64 hex/);
  });
});
