import { describe, expect, test } from "vitest";

import { TelegramSettingsViewSchema } from "./telegram-settings";

describe("Telegram settings contracts", () => {
  test("accepts the UTC-offset timestamp returned by Supabase", () => {
    expect(
      TelegramSettingsViewSchema.parse({
        enabled: true,
        chatId: "123456789",
        tokenConfigured: true,
        updatedAt: "2026-09-01T17:10:00.123456+00:00"
      }).updatedAt
    ).toBe("2026-09-01T17:10:00.123456+00:00");
  });
});
