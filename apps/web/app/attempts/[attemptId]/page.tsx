import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";
import {
  getTeacherAttemptDetail,
  TeacherAttemptNotFoundError
} from "@/src/attempts/teacher-attempt-repository";

export default async function AttemptDetailPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ readonly attemptId: string }>;
  readonly searchParams: Promise<{ readonly returnTo?: string | string[] }>;
}) {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/login?next=%2Fattempts");
    throw error;
  }
  const { attemptId } = await params;
  if (!z.uuid().safeParse(attemptId).success) notFound();
  let detail;
  try {
    detail = await getTeacherAttemptDetail(context.teacher.id, attemptId);
  } catch (error) {
    if (error instanceof TeacherAttemptNotFoundError) notFound();
    throw error;
  }
  const rawReturn = first((await searchParams).returnTo);
  const returnTo = rawReturn?.startsWith("/attempts") ? rawReturn : "/attempts";
  const exercises = groupByExercise(detail.fields);
  return (
    <TeacherShell
      profile={toTeacherProfile(context.teacher)}
      actions={
        <>
          <Link className="text-link" href={returnTo}>
            К списку попыток
          </Link>
          <Link className="text-link" href="/lessons">
            Все уроки
          </Link>
        </>
      }
    >
      <main className="attempt-detail-page">
        <p className="eyebrow">Завершённая попытка</p>
        <h1>{detail.summary.lessonTitle}</h1>
        <div className="attempt-detail-summary">
          <dl>
            <div>
              <dt>Ученик</dt>
              <dd>{detail.summary.studentDisplayName}</dd>
            </div>
            <div>
              <dt>Версия</dt>
              <dd>{detail.summary.lessonVersion}</dd>
            </div>
            <div>
              <dt>Дата</dt>
              <dd>{formatDate(detail.summary.createdAt)}</dd>
            </div>
            <div>
              <dt>Результат</dt>
              <dd>
                {detail.summary.correctCount} из {detail.summary.totalCount}
              </dd>
            </div>
            <div>
              <dt>Telegram</dt>
              <dd>{deliveryLabel(detail.summary.delivery.status)}</dd>
            </div>
          </dl>
          {detail.summary.delivery.failureCategory ? (
            <p role="status">
              Причина доставки: {failureLabel(detail.summary.delivery.failureCategory)}
            </p>
          ) : null}
        </div>
        <section className="attempt-answer-list" aria-labelledby="answers-title">
          <h2 id="answers-title">Ответы</h2>
          {exercises.map((exercise) => (
            <article className="attempt-exercise" key={exercise.exerciseId}>
              <p className="eyebrow">
                Группа {exercise.groupOrdinal} · задание {exercise.exerciseOrdinal}
              </p>
              <h3>{exercise.groupInstruction}</h3>
              <p>{exercise.exercisePrompt}</p>
              {exercise.fields.map((field) => (
                <div className={`attempt-answer ${field.status}`} key={field.fieldId}>
                  <div>
                    <strong>Поле {field.ordinal}</strong>
                    <span>{field.status === "correct" ? "✓ Правильно" : "✕ Неправильно"}</span>
                  </div>
                  <p>
                    <b>Ответ ученика:</b> {formatValue(field.submittedValue) || "—"}
                  </p>
                  {field.status === "incorrect" ? (
                    <p>
                      <b>Принятые ответы:</b> {field.acceptedDisplayValues.join(" / ") || "—"}
                    </p>
                  ) : null}
                  <details>
                    <summary>Диагностические ID</summary>
                    <code>
                      {field.exerciseId} · {field.fieldId}
                    </code>
                  </details>
                </div>
              ))}
            </article>
          ))}
        </section>
      </main>
    </TeacherShell>
  );
}
function formatValue(value: string | string[]) {
  return Array.isArray(value) ? value.join(" ") : value;
}
function groupByExercise<
  T extends {
    exerciseId: string;
    groupOrdinal: number;
    groupInstruction: string;
    exerciseOrdinal: number;
    exercisePrompt: string;
  }
>(fields: readonly T[]) {
  const groups = new Map<
    string,
    {
      exerciseId: string;
      groupOrdinal: number;
      groupInstruction: string;
      exerciseOrdinal: number;
      exercisePrompt: string;
      fields: T[];
    }
  >();
  for (const field of fields) {
    const current = groups.get(field.exerciseId);
    if (current) current.fields.push(field);
    else
      groups.set(field.exerciseId, {
        exerciseId: field.exerciseId,
        groupOrdinal: field.groupOrdinal,
        groupInstruction: field.groupInstruction,
        exerciseOrdinal: field.exerciseOrdinal,
        exercisePrompt: field.exercisePrompt,
        fields: [field]
      });
  }
  return [...groups.values()];
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(value)
  );
}
function deliveryLabel(status: string) {
  return (
    {
      pending: "Ожидает отправки",
      sending: "Отправляется",
      sent: "Отправлено",
      skipped: "Отключено или пропущено",
      failed: "Не доставлено"
    }[status] ?? status
  );
}
function failureLabel(category: string) {
  return (
    {
      unauthorized: "проверьте Bot Token и Chat ID",
      rate_limited: "Telegram временно ограничил отправку",
      provider: "временная ошибка Telegram",
      ambiguous: "неизвестно, было ли сообщение принято; повтор отключён",
      internal: "внутренняя ошибка без раскрытия данных"
    }[category] ?? "неизвестная ошибка"
  );
}
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
