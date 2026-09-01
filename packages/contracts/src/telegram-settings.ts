import { z } from "zod";

export const TelegramSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    chatId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^-?\d+$/u, "Chat ID must be numeric"),
    replacementBotToken: z.string().trim().min(20).max(256).optional()
  })
  .strict();

export const TelegramSettingsViewSchema = z
  .object({
    enabled: z.boolean(),
    chatId: z.string(),
    tokenConfigured: z.boolean(),
    botUsername: z.string().optional(),
    updatedAt: z.iso.datetime({ offset: true }).optional()
  })
  .strict();

export type TelegramSettingsUpdate = z.infer<typeof TelegramSettingsUpdateSchema>;
export type TelegramSettingsView = z.infer<typeof TelegramSettingsViewSchema>;
