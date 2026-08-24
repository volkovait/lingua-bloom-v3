import { redirect } from "next/navigation";
import Link from "next/link";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";

export default async function ImportProgressPage({
  params
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      const { runId } = await params;
      redirect(`/auth/login?next=${encodeURIComponent(`/imports/${runId}`)}`);
    }
    throw error;
  }
  const { runId } = await params;
  const profile = toTeacherProfile(context.teacher);
  return (
    <TeacherShell
      profile={profile}
      actions={
        <Link className="text-link" href="/lessons">
          Мои уроки
        </Link>
      }
    >
      <main>
        <p className="eyebrow">Импорт</p>
        <h1>Импорт принят</h1>
        <p>Источник сохранён. Обработка продолжится в устойчивом workflow.</p>
        <dl className="run-summary">
          <dt>Run ID</dt>
          <dd>{runId}</dd>
          <dt>Статус</dt>
          <dd>Принят</dd>
        </dl>
        <Link className="primary-link" href={`/imports/${runId}/review`}>
          Открыть результаты и проверку
        </Link>
      </main>
    </TeacherShell>
  );
}
