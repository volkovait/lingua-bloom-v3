import "server-only";

import { TelegramSettingsViewSchema, type TelegramSettingsUpdate } from "@lingua-bloom/contracts";
import { z } from "zod";

import { getServerEnvironment } from "@/src/config/server-env";
import { createAdminSupabaseClient } from "@/src/supabase/admin";

import { decryptTelegramToken, encryptTelegramToken } from "./credentials";

const RowSchema = z.object({
  owner_id: z.string(),
  enabled: z.boolean(),
  chat_id: z.string(),
  token_ciphertext: z.string(),
  token_nonce: z.string(),
  token_auth_tag: z.string(),
  encryption_key_version: z.string(),
  bot_username: z.string().nullable(),
  updated_at: z.string()
});

export async function getTelegramSettingsRow(ownerId: string) {
  const result = await createAdminSupabaseClient()
    .from("teacher_telegram_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (result.error) throw new Error("Telegram settings read failed");
  return result.data ? RowSchema.parse(result.data) : null;
}

export async function getTelegramSettingsView(ownerId: string) {
  const row = await getTelegramSettingsRow(ownerId);
  return TelegramSettingsViewSchema.parse({
    enabled: row?.enabled ?? false,
    chatId: row?.chat_id ?? "",
    tokenConfigured: row != null,
    ...(row?.bot_username ? { botUsername: row.bot_username } : {}),
    ...(row?.updated_at ? { updatedAt: row.updated_at } : {})
  });
}

export async function saveTelegramSettings(ownerId: string, update: TelegramSettingsUpdate) {
  const existing = await getTelegramSettingsRow(ownerId);
  const key = getServerEnvironment().TELEGRAM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) throw new Error("Telegram encryption is not configured");
  const encrypted = update.replacementBotToken
    ? encryptTelegramToken(update.replacementBotToken, key)
    : existing
      ? {
          tokenCiphertext: existing.token_ciphertext,
          tokenNonce: existing.token_nonce,
          tokenAuthTag: existing.token_auth_tag,
          encryptionKeyVersion: existing.encryption_key_version
        }
      : null;
  if (!encrypted) throw new Error("Bot Token is required");
  const result = await createAdminSupabaseClient().from("teacher_telegram_settings").upsert({
    owner_id: ownerId,
    enabled: update.enabled,
    chat_id: update.chatId,
    token_ciphertext: encrypted.tokenCiphertext,
    token_nonce: encrypted.tokenNonce,
    token_auth_tag: encrypted.tokenAuthTag,
    encryption_key_version: encrypted.encryptionKeyVersion,
    updated_at: new Date().toISOString()
  });
  if (result.error) throw new Error("Telegram settings save failed");
  return getTelegramSettingsView(ownerId);
}

export async function resolveTelegramCredentials(ownerId: string) {
  const row = await getTelegramSettingsRow(ownerId);
  if (!row?.enabled) return null;
  const key = getServerEnvironment().TELEGRAM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) return null;
  return {
    chatId: row.chat_id,
    token: decryptTelegramToken(
      {
        tokenCiphertext: row.token_ciphertext,
        tokenNonce: row.token_nonce,
        tokenAuthTag: row.token_auth_tag,
        encryptionKeyVersion: row.encryption_key_version
      },
      key
    )
  };
}
