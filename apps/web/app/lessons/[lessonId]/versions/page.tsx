import { LessonSpecSchema } from "@lingua-bloom/contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { requireOwnedResource } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";
import { E2E_LESSON_ID, E2E_PUBLIC_LESSON_ID, isE2EFixtureMode } from "@/src/testing/e2e-fixtures";

const LessonRowSchema = z.object({ title: z.string(), public_lesson_id: z.string() });
const VersionRowSchema = z.object({
  version: z.number(),
  created_at: z.string(),
  lesson_spec: z.unknown()
});

export default async function VersionHistoryPage({
  params
}: {
  readonly params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  if (isE2EFixtureMode() && lessonId === E2E_LESSON_ID) return <E2EVersionHistory />;
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      redirect(`/auth/login?next=${encodeURIComponent(`/lessons/${lessonId}/versions`)}`);
    throw error;
  }
  await requireOwnedResource(context.supabase, context.teacher.id, "lessons", lessonId);
  const [lessonResult, versionsResult] = await Promise.all([
    context.supabase.from("lessons").select("title,public_lesson_id").eq("id", lessonId).single(),
    context.supabase
      .from("lesson_versions")
      .select("version,created_at,lesson_spec")
      .eq("lesson_id", lessonId)
      .order("version", { ascending: false })
  ]);
  if (lessonResult.error || versionsResult.error) throw new Error("Failed to load lesson versions");
  const lesson = LessonRowSchema.parse(lessonResult.data);
  const versions = z
    .array(VersionRowSchema)
    .parse(versionsResult.data)
    .map((row) => ({
      ...row,
      spec: LessonSpecSchema.parse(row.lesson_spec)
    }));
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
      <main className="versions-page">
        <p className="eyebrow">История версий</p>
        <h1>{lesson.title}</h1>
        <Link className="primary-link" href={`/learn/${lesson.public_lesson_id}`}>
          Открыть текущую версию
        </Link>
        <div className="version-list">
          {versions.map((entry, index) => {
            const previous = versions[index + 1];
            const count = countExercises(entry.spec);
            const previousCount = previous ? countExercises(previous.spec) : null;
            return (
              <article className="version-card" key={entry.version}>
                <div>
                  <strong>Версия {entry.version}</strong>
                  <small>{new Date(entry.created_at).toLocaleString("ru-RU")}</small>
                </div>
                <p>
                  {count} заданий
                  {previousCount == null
                    ? " · первая публикация"
                    : ` · изменение количества: ${String(count - previousCount)}`}
                </p>
              </article>
            );
          })}
        </div>
      </main>
    </TeacherShell>
  );
}

function E2EVersionHistory() {
  return (
    <main className="versions-page">
      <p className="eyebrow">История версий</p>
      <h1>English practice</h1>
      <Link className="primary-link" href={`/learn/${E2E_PUBLIC_LESSON_ID}`}>
        Открыть текущую версию
      </Link>
      <div className="version-list">
        <article className="version-card">
          <div>
            <strong>Версия 2</strong>
          </div>
          <p>1 заданий · изменение количества: 0</p>
        </article>
        <article className="version-card">
          <div>
            <strong>Версия 1</strong>
          </div>
          <p>1 заданий · первая публикация</p>
        </article>
      </div>
    </main>
  );
}

function countExercises(spec: z.infer<typeof LessonSpecSchema>) {
  return spec.groups.reduce((sum, group) => sum + group.exercises.length, 0);
}
