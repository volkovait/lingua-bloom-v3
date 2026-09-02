import {
  AttemptHistoryResultStatusSchema,
  TelegramDeliveryStatusSchema
} from "@lingua-bloom/contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";
import { listTeacherAttempts } from "@/src/attempts/teacher-attempt-repository";

const LessonRowSchema = z.object({ id: z.string(), title: z.string() });

export default async function AttemptsPage({
  searchParams
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/login?next=%2Fattempts");
    throw error;
  }
  const raw = await searchParams;
  const query = first(raw.query)?.trim().slice(0, 160) ?? "";
  const cursor = first(raw.cursor);
  const lessonId = z.uuid().safeParse(first(raw.lessonId)).data;
  const resultStatus = AttemptHistoryResultStatusSchema.safeParse(first(raw.resultStatus)).data;
  const deliveryStatus = TelegramDeliveryStatusSchema.safeParse(first(raw.deliveryStatus)).data;
  const [page, lessonsResult] = await Promise.all([
    listTeacherAttempts(context.teacher.id, {
      ...(cursor ? { cursor } : {}),
      ...(query ? { query } : {}),
      ...(lessonId ? { lessonId } : {}),
      ...(resultStatus ? { resultStatus } : {}),
      ...(deliveryStatus ? { deliveryStatus } : {})
    }),
    context.supabase
      .from("lessons")
      .select("id,title")
      .eq("owner_id", context.teacher.id)
      .order("title")
  ]);
  if (lessonsResult.error) throw new Error("LESSON_FILTERS_READ_FAILED");
  const lessons = z.array(LessonRowSchema).parse(lessonsResult.data);
  const currentQuery = new URLSearchParams();
  if (query) currentQuery.set("query", query);
  if (lessonId) currentQuery.set("lessonId", lessonId);
  if (resultStatus) currentQuery.set("resultStatus", resultStatus);
  if (deliveryStatus) currentQuery.set("deliveryStatus", deliveryStatus);
  const returnTo = `/attempts${currentQuery.size ? `?${currentQuery.toString()}` : ""}`;

  return (
    <TeacherShell
      profile={toTeacherProfile(context.teacher)}
      actions={
        <Link className="text-link" href="/lessons">
          Все уроки
        </Link>
      }
    >
      <main className="attempts-page">
        <header className="attempts-header">
          <div>
            <p className="eyebrow">Результаты учеников</p>
            <h1>Попытки учеников</h1>
          </div>
          <span
            className="lesson-total"
            aria-label={`Найдено попыток: ${String(page.totalMatched)}`}
          >
            {page.totalMatched}
          </span>
        </header>
        <form className="attempt-filters" method="get" role="search">
          <label>
            <span>Урок или ученик</span>
            <input defaultValue={query} maxLength={160} name="query" type="search" />
          </label>
          <label>
            <span>Урок</span>
            <select defaultValue={lessonId ?? ""} name="lessonId">
              <option value="">Все уроки</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Результат</span>
            <select defaultValue={resultStatus ?? ""} name="resultStatus">
              <option value="">Все</option>
              <option value="correct">Полностью правильно</option>
              <option value="partial">Частично</option>
              <option value="incorrect">Неправильно</option>
            </select>
          </label>
          <label>
            <span>Telegram</span>
            <select defaultValue={deliveryStatus ?? ""} name="deliveryStatus">
              <option value="">Все</option>
              <option value="pending">Ожидает</option>
              <option value="sending">Отправляется</option>
              <option value="sent">Отправлено</option>
              <option value="skipped">Пропущено</option>
              <option value="failed">Ошибка</option>
            </select>
          </label>
          <div className="lesson-filter-actions">
            <button className="primary-link" type="submit">
              Найти
            </button>
            <Link className="text-link" href="/attempts">
              Сбросить
            </Link>
          </div>
        </form>
        {page.items.length === 0 ? (
          <section className="lessons-empty" role="status">
            <h2>Попытки не найдены</h2>
            <p>Измените фильтры или дождитесь первого прохождения опубликованного урока.</p>
          </section>
        ) : (
          <div className="attempt-table-wrap">
            <table className="attempt-table">
              <thead>
                <tr>
                  <th>Урок</th>
                  <th>Ученик</th>
                  <th>Дата</th>
                  <th>Результат</th>
                  <th>Telegram</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {page.items.map((attempt) => (
                  <tr key={attempt.attemptId}>
                    <td>
                      <strong>{attempt.lessonTitle}</strong>
                      <small>Версия {attempt.lessonVersion}</small>
                    </td>
                    <td>{attempt.studentDisplayName}</td>
                    <td>{formatDate(attempt.createdAt)}</td>
                    <td>
                      <StatusBadge kind={attempt.resultStatus} text={resultLabel(attempt)} />
                    </td>
                    <td>
                      <StatusBadge
                        kind={attempt.delivery.status}
                        text={deliveryLabel(attempt.delivery.status)}
                      />
                    </td>
                    <td>
                      <Link
                        className="secondary-link"
                        href={`/attempts/${attempt.attemptId}?returnTo=${encodeURIComponent(returnTo)}`}
                      >
                        Посмотреть ответы
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor ? (
          <Link
            className="secondary-link attempt-next"
            href={nextHref(currentQuery, page.nextCursor)}
          >
            Следующие 25
          </Link>
        ) : null}
      </main>
    </TeacherShell>
  );
}

function StatusBadge({ kind, text }: { readonly kind: string; readonly text: string }) {
  return <span className={`attempt-status status-${kind}`}>{text}</span>;
}
function resultLabel(item: { correctCount: number; totalCount: number }) {
  return `${String(item.correctCount)} из ${String(item.totalCount)}`;
}
function deliveryLabel(status: string) {
  return (
    {
      pending: "Ожидает",
      sending: "Отправляется",
      sent: "Отправлено",
      skipped: "Пропущено",
      failed: "Ошибка"
    }[status] ?? status
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value)
  );
}
function nextHref(params: URLSearchParams, cursor: string) {
  const next = new URLSearchParams(params);
  next.set("cursor", cursor);
  return `/attempts?${next}`;
}
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
