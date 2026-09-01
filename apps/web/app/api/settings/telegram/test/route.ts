import { NextResponse } from "next/server";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { sendTelegramMessage, TelegramProviderError } from "@/src/telegram/client";
import { resolveTelegramCredentials } from "@/src/telegram/settings-repository";

export async function POST() {
  try {
    const { teacher } = await requireTeacher();
    const credentials = await resolveTelegramCredentials(teacher.id);
    if (!credentials)
      return response(409, "TELEGRAM_NOT_CONFIGURED", "Сначала сохраните и включите Telegram");
    await sendTelegramMessage({
      ...credentials,
      text: "✅ <b>Lingua Bloom</b>\nТестовое уведомление: Telegram настроен правильно."
    });
    return NextResponse.json({ sent: true });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return response(401, "AUTH_REQUIRED", "Требуется вход");
    if (error instanceof TelegramProviderError)
      return response(
        502,
        "TELEGRAM_TEST_FAILED",
        "Telegram отклонил сообщение. Проверьте Bot Token, Chat ID и /start"
      );
    return response(500, "TELEGRAM_TEST_FAILED", "Не удалось отправить тестовое сообщение");
  }
}

function response(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
}
