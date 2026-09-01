import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Telegram settings API contract", () => {
  test("requires the verified teacher and returns only a safe view", async () => {
    const route = await read("apps/web/app/api/settings/telegram/route.ts");
    expect(route).toContain("requireTeacher");
    expect(route).toContain("getTelegramSettingsView");
    expect(route).not.toContain("token_ciphertext");
    expect(route).not.toContain("token_auth_tag");
  });

  test("exposes an explicit test-send route with sanitized errors", async () => {
    const route = await read("apps/web/app/api/settings/telegram/test/route.ts");
    expect(route).toContain("TelegramProviderError");
    expect(route).not.toContain("error.message");
    expect(route).not.toContain("response.text");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
