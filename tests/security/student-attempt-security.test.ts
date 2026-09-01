import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("student attempt security boundary", () => {
  test("does not accept client correctness or score", async () => {
    const [contract, route] = await Promise.all([
      read("packages/contracts/src/student-attempt.ts"),
      read("apps/web/app/api/lessons/[lessonRef]/attempts/route.ts")
    ]);
    expect(contract).not.toMatch(/submittedScore|clientScore|correctLine/);
    expect(route).toContain("gradeAndPersistAttempt");
    expect(route).toContain("Cache-Control");
    expect(route).toContain("claimRateLimit");
  });

  test("keeps Telegram secrets server-only and encrypted", async () => {
    const [settings, credentials, view] = await Promise.all([
      read("apps/web/src/telegram/settings-repository.ts"),
      read("apps/web/src/telegram/credentials.ts"),
      read("packages/contracts/src/telegram-settings.ts")
    ]);
    expect(credentials).toContain('"aes-256-gcm"');
    expect(settings).toContain("token_ciphertext");
    expect(view).toContain("tokenConfigured");
    expect(view).not.toContain("tokenCiphertext");
  });

  test("renders accessible result status and first-error focus", async () => {
    const renderer = await read("apps/web/components/lesson/lesson-renderer.tsx");
    expect(renderer).toContain("scrollIntoView");
    expect(renderer).toContain("prefers-reduced-motion");
    expect(renderer).toContain("aria-invalid");
    expect(renderer).toContain("✓ Правильно");
    expect(renderer).toContain("✕ Неправильно");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
