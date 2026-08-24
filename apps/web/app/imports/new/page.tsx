import Link from "next/link";
import { redirect } from "next/navigation";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { SourceImportForm } from "@/components/import/source-import-form";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile, type TeacherProfile } from "@/src/auth/teacher-profile";
import { isE2EFixtureMode } from "@/src/testing/e2e-fixtures";

export default async function NewImportPage() {
  let profile: TeacherProfile | null = null;
  if (!isE2EFixtureMode()) {
    try {
      const context = await requireTeacher();
      profile = toTeacherProfile(context.teacher);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        redirect("/auth/login?next=%2Fimports%2Fnew");
      }
      throw error;
    }
  }
  const content = (
    <main>
      <p className="eyebrow">Новый импорт</p>
      <h1>Перенести готовые упражнения</h1>
      <p className="lede">
        Загрузите PDF или вставьте текст. Оригинал останется неизменным, а спорные ответы потребуют
        вашей проверки.
      </p>
      <SourceImportForm />
    </main>
  );
  return profile ? (
    <TeacherShell
      profile={profile}
      actions={
        <Link className="text-link" href="/lessons">
          Мои уроки
        </Link>
      }
    >
      {content}
    </TeacherShell>
  ) : (
    content
  );
}
