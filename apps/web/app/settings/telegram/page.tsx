import Link from "next/link";
import { redirect } from "next/navigation";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { TelegramSettingsForm } from "@/components/settings/telegram-settings-form";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";

export default async function TelegramSettingsPage() {
  try {
    const { teacher } = await requireTeacher();
    return (
      <TeacherShell
        profile={toTeacherProfile(teacher)}
        actions={
          <Link className="text-link" href="/lessons">
            Мои уроки
          </Link>
        }
      >
        <main className="settings-page">
          <p className="eyebrow">Настройки преподавателя</p>
          <h1>Результаты в Telegram</h1>
          <p className="lede">
            Подключите личного бота, чтобы получать результаты опубликованных тестов.
          </p>
          <TelegramSettingsForm />
        </main>
      </TeacherShell>
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/login?next=%2Fsettings%2Ftelegram");
    throw error;
  }
}
