import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.ts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV, recommended for GCM
const AUTH_TAG_LENGTH = 16;

function keyFromHex(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("Encryption key must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * Output format: `iv:authTag:ciphertext`, each part base64.
 */
export function encryptWithKey(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFromHex(hexKey), iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

/** Decrypt a value produced by `encryptWithKey`. Throws if tampered or malformed. */
export function decryptWithKey(payload: string, hexKey: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, keyFromHex(hexKey), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Encrypt using ENCRYPTION_KEY from config. */
export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, config.ENCRYPTION_KEY);
}

/** Decrypt using ENCRYPTION_KEY from config. */
export function decrypt(payload: string): string {
  return decryptWithKey(payload, config.ENCRYPTION_KEY);
}
