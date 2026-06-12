// AES-256-GCM encryption for OAuth tokens at rest. The key is the
// 64-hex-character LOCAL_ENCRYPTION_KEY from .env.local (generate with
// `openssl rand -hex 32`). Pure functions take the key explicitly so
// they are testable; the env-reading wrappers live at the bottom.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_HEX_LENGTH = 64;

export function isValidKeyHex(keyHex: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(keyHex);
}

export function encryptWithKey(plaintext: string, keyHex: string): string {
  if (!isValidKeyHex(keyHex)) {
    throw new Error(
      `LOCAL_ENCRYPTION_KEY must be ${KEY_HEX_LENGTH} hex characters (openssl rand -hex 32)`,
    );
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptWithKey(payload: string, keyHex: string): string {
  if (!isValidKeyHex(keyHex)) {
    throw new Error(
      `LOCAL_ENCRYPTION_KEY must be ${KEY_HEX_LENGTH} hex characters (openssl rand -hex 32)`,
    );
  }
  const [ivHex, tagHex, dataHex] = payload.split(".");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Encrypted payload is malformed");
  }
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function requireKey(): string {
  const key = process.env.LOCAL_ENCRYPTION_KEY ?? "";
  if (!isValidKeyHex(key)) {
    throw new Error(
      "LOCAL_ENCRYPTION_KEY is missing or invalid. Generate one with `openssl rand -hex 32` and add it to .env.local before connecting external accounts.",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, requireKey());
}

export function decryptSecret(payload: string): string {
  return decryptWithKey(payload, requireKey());
}
