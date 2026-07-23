import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

// Per-org Paystack keys are encrypted at rest with AES-256-GCM under a
// single master key (PAYSTACK_KEY_ENCRYPTION_KEY). Stored format:
// base64(iv[12] || authTag[16] || ciphertext). Losing the master key means
// re-entering every org's keys — acceptable, they're re-issuable secrets.

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function masterKey(): Buffer {
  const key = Buffer.from(env.paystackKeyEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PAYSTACK_KEY_ENCRYPTION_KEY must be 32 bytes of base64 (openssl rand -base64 32)",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
