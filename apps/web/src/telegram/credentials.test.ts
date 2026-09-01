import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";

import { decryptTelegramToken, encryptTelegramToken } from "./credentials";

describe("Telegram credential encryption", () => {
  test("round-trips and uses a unique nonce", () => {
    const key = randomBytes(32).toString("base64");
    const first = encryptTelegramToken("secret-token", key);
    const second = encryptTelegramToken("secret-token", key);
    expect(decryptTelegramToken(first, key)).toBe("secret-token");
    expect(first.tokenNonce).not.toBe(second.tokenNonce);
    expect(first.tokenCiphertext).not.toContain("secret-token");
  });

  test("rejects a wrong key", () => {
    const envelope = encryptTelegramToken("secret-token", randomBytes(32).toString("base64"));
    expect(() => decryptTelegramToken(envelope, randomBytes(32).toString("base64"))).toThrow();
  });
});
