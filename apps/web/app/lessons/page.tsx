import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BrandLogo } from "@/components/brand-logo";
import { TeacherProfileMenu } from "@/components/auth/teacher-profile-menu";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";

const LessonRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  public_lesson_id: z.string(),
  created_at: z.string()
});
const VersionRowSchema = z.object({
  lesson_id: z.string(),
  version: z.number(),
  created_at: z.string()
});
const ActiveRunRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  source_document_id: z.string(),
  updated_at: z.string()
});
const SourceTitleRowSchema = z.object({ id: z.string(), title: z.string() });

export default async function LessonsPage() {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/login?next=%2Flessons");
    throw error;
  }

  const [lessonsResult, runsResult] = await Promise.all([
    context.supabase
      .from("lessons")
      .select("id,title,public_lesson_id,created_at")
      .eq("owner_id", context.teacher.id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("pipeline_runs")
      .select("id,status,source_document_id,updated_at")
      .eq("owner_id", context.teacher.id)
      .in("status", ["accepted", "processing", "awaiting_review", "ready_to_publish", "failed"])
      .order("updated_at", { ascending: false })
  ]);
  if (lessonsResult.error || runsResult.error) throw new Error("Failed to load lesson workspace");

  const lessons = z.array(LessonRowSchema).parse(lessonsResult.data);
  const activeRuns = z.array(ActiveRunRowSchema).parse(runsResult.data);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const sourceIds = [...new Set(activeRuns.map((run) => run.source_document_id))];
  const [versionsResult, sourcesResult] = await Promise.all([
    lessonIds.length > 0
      ? context.supabase
          .from("lesson_versions")
          .select("lesson_id,version,created_at")
          .in("lesson_id", lessonIds)
          .order("version", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length > 0
      ? context.supabase.from("source_documents").select("id,title").in("id", sourceIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (versionsResult.error || sourcesResult.error) throw new Error("Failed to load lesson details");

  const versions = z.array(VersionRowSchema).parse(versionsResult.data);
  const sourceTitles = new Map(
    z
      .array(SourceTitleRowSchema)
      .parse(sourcesResult.data)
      .map((source) => [source.id, source.title])
  );
  const versionsByLesson = new Map<string, z.infer<typeof VersionRowSchema>[]>();
  for (const version of versions) {
    const current = versionsByLesson.get(version.lesson_id) ?? [];
    current.push(version);
    versionsByLesson.set(version.lesson_id, current);
  }

  const profile = toTeacherProfile(context.teacher);

  return (
    <main className="lessons-page">
      <nav className="lessons-nav">
        <BrandLogo transparent />
        <div className="teacher-shell-actions">
          <Link className="primary-link" href="/imports/new">
            Создать урок
          </Link>
          <TeacherProfileMenu profile={profile} />
        </div>
      </nav>

      <header className="lessons-header">
        <div>
          <p className="eyebrow">Библиотека преподавателя</p>
          <h1>Мои уроки</h1>
          <p>Черновики, готовые к публикации материалы и опубликованные версии.</p>
        </div>
        <span className="lesson-total">{lessons.length + activeRuns.length}</span>
      </header>

      {activeRuns.length > 0 ? (
        <section className="active-imports" aria-labelledby="active-imports-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Работа продолжается</p>
              <h2 id="active-imports-title">Черновики и публикация</h2>
            </div>
            <span className="lesson-total">{activeRuns.length}</span>
          </div>
          <div className="lesson-grid">
            {activeRuns.map((run) => {
              const ready = run.status === "ready_to_publish";
              return (
                <article className={`lesson-card${ready ? " ready-to-publish" : ""}`} key={run.id}>
                  <div className="lesson-card-heading">
                    <span className={ready ? "lesson-status ready" : "lesson-status"}>
                      {runStatusLabel(run.status)}
                    </span>
                    <span>{new Date(run.updated_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                  <h2>{sourceTitles.get(run.source_document_id) ?? "Новый урок"}</h2>
                  <p>
                    {ready
                      ? "Все обязательные ответы проверены. Урок можно опубликовать."
                      : "Откройте материал, чтобы продолжить обработку или проверку."}
                  </p>
                  <div className="lesson-card-actions">
                    <Link
                      className={ready ? "primary-link" : "secondary-link"}
                      href={ready ? `/imports/${run.id}/publish` : `/imports/${run.id}/review`}
                    >
                      {ready ? "Опубликовать урок" : "Открыть черновик"}
                    </Link>
                    {ready ? (
                      <Link className="text-link" href={`/imports/${run.id}/review`}>
                        Проверить ещё раз
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="published-lessons" aria-labelledby="published-lessons-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Доступны ученикам</p>
            <h2 id="published-lessons-title">Опубликованные уроки</h2>
          </div>
          <span className="lesson-total">{lessons.length}</span>
        </div>
        {lessons.length === 0 ? (
          <section className="lessons-empty">
            <h3>Опубликованных уроков пока нет</h3>
            <p>Загрузите материал, проверьте ответы и опубликуйте первую версию.</p>
            {activeRuns.length === 0 ? (
              <Link className="primary-link" href="/imports/new">
                Создать первый урок
              </Link>
            ) : null}
          </section>
        ) : (
          <div className="lesson-grid">
            {lessons.map((lesson) => {
              const lessonVersions = versionsByLesson.get(lesson.id) ?? [];
              const latest = lessonVersions[0];
              return (
                <article className="lesson-card" key={lesson.id}>
                  <div className="lesson-card-heading">
                    <span className="lesson-status">Опубликован</span>
                    <span>Версия {latest?.version ?? 1}</span>
                  </div>
                  <h2>{lesson.title}</h2>
                  <p>
                    {lessonVersions.length} {versionWord(lessonVersions.length)} · обновлён{" "}
                    {new Date(latest?.created_at ?? lesson.created_at).toLocaleDateString("ru-RU")}
                  </p>
                  <div className="lesson-card-actions">
                    <Link className="primary-link" href={`/learn/${lesson.public_lesson_id}`}>
                      Открыть урок
                    </Link>
                    <Link className="secondary-link" href={`/lessons/${lesson.id}/versions`}>
                      История версий
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function runStatusLabel(status: string) {
  return (
    {
      accepted: "Принят",
      processing: "Обрабатывается",
      awaiting_review: "Нужна проверка",
      ready_to_publish: "Готов к публикации",
      failed: "Ошибка обработки"
    }[status] ?? status
  );
}

function versionWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "версий";
  if (last === 1) return "версия";
  if (last >= 2 && last <= 4) return "версии";
  return "версий";
}
