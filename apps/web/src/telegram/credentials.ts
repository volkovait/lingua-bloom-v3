import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedTelegramToken {
  readonly tokenCiphertext: string;
  readonly tokenNonce: string;
  readonly tokenAuthTag: string;
  readonly encryptionKeyVersion: string;
}

export function encryptTelegramToken(token: string, encodedKey: string): EncryptedTelegramToken {
  const key = decodeKey(encodedKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(token.trim(), "utf8"), cipher.final()]);
  return {
    tokenCiphertext: ciphertext.toString("base64"),
    tokenNonce: nonce.toString("base64"),
    tokenAuthTag: cipher.getAuthTag().toString("base64"),
    encryptionKeyVersion: "v1"
  };
}

export function decryptTelegramToken(envelope: EncryptedTelegramToken, encodedKey: string) {
  if (envelope.encryptionKeyVersion !== "v1") throw new Error("Unsupported encryption key version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(envelope.tokenNonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tokenAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.tokenCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function decodeKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new Error("TELEGRAM_CREDENTIALS_ENCRYPTION_KEY must be 32 base64 bytes");
  return key;
}
