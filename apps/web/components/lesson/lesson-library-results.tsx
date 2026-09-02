"use client";

import Link from "next/link";
import * as React from "react";

import {
  LessonLibraryPageSchema,
  type LessonLibraryCard,
  type LessonLibraryPage,
  type LessonLibraryStatus
} from "@/src/lessons/library-filter";

export function LessonLibraryResults({
  initialPage,
  query,
  status
}: {
  readonly initialPage: LessonLibraryPage;
  readonly query: string;
  readonly status: LessonLibraryStatus;
}) {
  const [items, setItems] = React.useState(initialPage.items);
  const [nextCursor, setNextCursor] = React.useState(initialPage.nextCursor);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const loadingRef = React.useRef(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const published = items.filter((item) => item.kind === "published");
  const drafts = items.filter((item) => item.kind === "draft");

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: query, status, cursor: nextCursor });
    try {
      const response = await fetch(`/api/lessons/library?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("request_failed");
      const page = LessonLibraryPageSchema.parse(payload);
      setItems((current) => mergeUnique(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      setError("Не удалось загрузить следующую страницу. Попробуйте ещё раз.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [nextCursor, query, status]);

  React.useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !nextCursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, nextCursor]);

  if (items.length === 0) {
    const filtersActive = Boolean(query.trim()) || status !== "all";
    return (
      <section className="lessons-empty lesson-search-empty" role="status">
        <h2>{filtersActive ? "Уроки не найдены" : "Уроков пока нет"}</h2>
        <p>
          {filtersActive
            ? "Измените название или выберите другой статус."
            : "Загрузите материал, проверьте ответы и опубликуйте первый урок."}
        </p>
        <Link
          className={filtersActive ? "secondary-link" : "primary-link"}
          href={filtersActive ? "/lessons" : "/imports/new"}
        >
          {filtersActive ? "Сбросить фильтры" : "Создать первый урок"}
        </Link>
      </section>
    );
  }

  return (
    <>
      {published.length > 0 ? (
        <LessonSection
          eyebrow="Доступны ученикам"
          id="published-lessons-title"
          title="Опубликованные уроки"
        >
          {published.map((lesson) => (
            <PublishedLessonCard key={lesson.id} lesson={lesson} />
          ))}
        </LessonSection>
      ) : null}

      {drafts.length > 0 ? (
        <LessonSection
          eyebrow="Работа продолжается"
          id="active-imports-title"
          title="Черновики и публикация"
        >
          {drafts.map((run) => (
            <DraftLessonCard key={run.id} run={run} />
          ))}
        </LessonSection>
      ) : null}

      <div className="lesson-pagination" ref={sentinelRef}>
        {error ? <p role="alert">{error}</p> : null}
        {nextCursor ? (
          <button
            className="secondary-link"
            disabled={loading}
            onClick={() => void loadMore()}
            type="button"
          >
            {loading ? "Загружаем…" : "Показать ещё"}
          </button>
        ) : (
          <p className="lesson-pagination-complete">Все подходящие уроки загружены.</p>
        )}
      </div>
    </>
  );
}

function LessonSection({
  eyebrow,
  id,
  title,
  children
}: {
  readonly eyebrow: string;
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      className={id.startsWith("published") ? "published-lessons" : "active-imports"}
      aria-labelledby={id}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
      </div>
      <div className="lesson-grid">{children}</div>
    </section>
  );
}

function PublishedLessonCard({
  lesson
}: {
  readonly lesson: Extract<LessonLibraryCard, { kind: "published" }>;
}) {
  return (
    <article className="lesson-card">
      <div className="lesson-card-heading">
        <span className="lesson-status">Опубликован</span>
        <span>Версия {lesson.latestVersion}</span>
      </div>
      <h2>{lesson.title}</h2>
      <p>
        {lesson.versionCount} {versionWord(lesson.versionCount)} · обновлён{" "}
        {new Date(lesson.updatedAt).toLocaleDateString("ru-RU")}
      </p>
      <div className="lesson-card-actions">
        <Link className="primary-link" href={`/learn/${lesson.publicLessonId}`}>
          Открыть урок
        </Link>
        <Link className="secondary-link" href={`/lessons/${lesson.id}/versions`}>
          История версий
        </Link>
        <Link className="text-link" href={`/attempts?lessonId=${lesson.id}`}>
          Попытки
        </Link>
      </div>
    </article>
  );
}

function DraftLessonCard({ run }: { readonly run: Extract<LessonLibraryCard, { kind: "draft" }> }) {
  const ready = run.status === "ready_to_publish";
  return (
    <article className={`lesson-card${ready ? " ready-to-publish" : ""}`}>
      <div className="lesson-card-heading">
        <span className={ready ? "lesson-status ready" : "lesson-status"}>
          {runStatusLabel(run.status)}
        </span>
        <span>{new Date(run.updatedAt).toLocaleDateString("ru-RU")}</span>
      </div>
      <h2>{run.title}</h2>
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
}

function mergeUnique(current: readonly LessonLibraryCard[], next: readonly LessonLibraryCard[]) {
  const keys = new Set(current.map((item) => `${item.kind}:${item.id}`));
  return [...current, ...next.filter((item) => !keys.has(`${item.kind}:${item.id}`))];
}

function runStatusLabel(status: Extract<LessonLibraryCard, { kind: "draft" }>["status"]) {
  return {
    accepted: "Принят",
    processing: "Обрабатывается",
    awaiting_review: "Нужна проверка",
    ready_to_publish: "Готов к публикации",
    failed: "Ошибка обработки"
  }[status];
}

function versionWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "версий";
  if (last === 1) return "версия";
  if (last >= 2 && last <= 4) return "версии";
  return "версий";
}
