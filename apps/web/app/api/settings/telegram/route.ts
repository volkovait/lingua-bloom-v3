import { TelegramSettingsUpdateSchema } from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getTelegramSettingsView, saveTelegramSettings } from "@/src/telegram/settings-repository";

export async function GET() {
  try {
    const { teacher } = await requireTeacher();
    return NextResponse.json(await getTelegramSettingsView(teacher.id), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return response(401, "AUTH_REQUIRED", "Требуется вход");
    return response(500, "SETTINGS_READ_FAILED", "Не удалось загрузить настройки Telegram");
  }
}

export async function PUT(request: Request) {
  try {
    const { teacher } = await requireTeacher();
    const parsed = TelegramSettingsUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return response(400, "INVALID_SETTINGS", "Проверьте Chat ID и Bot Token");
    return NextResponse.json(await saveTelegramSettings(teacher.id, parsed.data), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return response(401, "AUTH_REQUIRED", "Требуется вход");
    console.error("Telegram settings save failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return response(500, "SETTINGS_SAVE_FAILED", "Не удалось сохранить настройки Telegram");
  }
}

function response(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}
