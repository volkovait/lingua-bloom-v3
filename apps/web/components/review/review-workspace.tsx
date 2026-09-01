"use client";

import type {
  ReviewDraft,
  UnknownLayoutReview as UnknownLayoutReviewContract
} from "@lingua-bloom/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ExerciseDraftEditor, type ReviewIssue } from "./exercise-draft-editor";
import { SourceViewer } from "./source-viewer";
import { WorkflowLog, type WorkflowEvent } from "./workflow-log";
import { UnknownLayoutReview } from "./unknown-layout-review";
import { shouldPollForDraft } from "@/src/review/polling-policy";

interface ImportWorkspace {
  readonly runId: string;
  readonly status: string;
  readonly currentStep: string | null;
  readonly updatedAt: string;
  readonly recovery: {
    readonly kind: "dispatch_not_started" | "worker_heartbeat_expired";
    readonly redispatchAllowed: true;
    readonly staleSince: string;
  } | null;
  readonly failure: {
    readonly code: string;
    readonly kind: "retriable" | "terminal";
    readonly message: string;
    readonly manualResumeAllowed: boolean;
  } | null;
  readonly source: {
    readonly title: string;
    readonly kind: "pdf" | "text";
    readonly signedUrl: string | null;
  };
  readonly documentIr: {
    readonly blocks?: readonly { readonly rawText?: string }[];
  } | null;
  readonly draft: {
    readonly id: string;
    readonly revision: number;
    readonly payload: ReviewDraft;
  } | null;
  readonly unknownLayoutReview: UnknownLayoutReviewContract | null;
  readonly issues: readonly ReviewIssue[];
  readonly events: readonly WorkflowEvent[];
}

export function ReviewWorkspace({ runId }: { readonly runId: string }) {
  const [workspace, setWorkspace] = useState<ImportWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [redispatching, setRedispatching] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/imports/${encodeURIComponent(runId)}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Не удалось загрузить состояние импорта.");
    const result = (await response.json()) as ImportWorkspace;
    setWorkspace(result);
    return result;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch((cause: unknown) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить импорт.");
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!shouldPollForDraft(workspace)) return;
    let cancelled = false;
    const interval = window.setInterval(() => {
      if (cancelled) return;
      void refresh().catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить импорт.");
      });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    refresh,
    workspace?.draft,
    workspace?.recovery,
    workspace?.status,
    workspace?.unknownLayoutReview
  ]);

  async function resume() {
    setResuming(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/${encodeURIComponent(runId)}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error("Продолжить обработку сейчас невозможно.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось продолжить обработку.");
    } finally {
      setResuming(false);
    }
  }

  async function redispatch() {
    setRedispatching(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/${encodeURIComponent(runId)}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { code?: string } | null;
        throw new Error(
          result?.code === "DISPATCH_NOT_STALE"
            ? "Обработка уже возобновилась. Обновляем состояние."
            : "Не удалось повторно запустить обработку."
        );
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось повторно запустить обработку.");
    } finally {
      setRedispatching(false);
    }
  }

  if (error && !workspace)
    return <WorkspaceMessage title="Не удалось открыть импорт" text={error} />;
  if (workspace?.recovery && !workspace.draft) {
    return (
      <WorkspaceMessage
        title="Обработка не отвечает"
        text={
          workspace.recovery.kind === "dispatch_not_started"
            ? "Задание сохранено, но обработчик не начал работу. Можно безопасно отправить его повторно."
            : "Обработчик давно не обновлял состояние. Можно безопасно продолжить тот же импорт."
        }
      >
        <p>Последнее обновление: {formatUpdatedAt(workspace.updatedAt)}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-link"
          type="button"
          disabled={redispatching}
          onClick={() => void redispatch()}
        >
          {redispatching ? "Отправляем…" : "Повторно запустить обработку"}
        </button>
        <WorkflowLog events={workspace.events} currentStep={workspace.currentStep} />
      </WorkspaceMessage>
    );
  }
  if (!workspace || (!workspace.draft && ["accepted", "processing"].includes(workspace.status))) {
    return (
      <WorkspaceMessage
        title="Извлекаем упражнения"
        text={
          workspace
            ? `Страница обновится автоматически. Последнее обновление: ${formatUpdatedAt(workspace.updatedAt)}.`
            : "Загружаем состояние импорта."
        }
        progress
      >
        {workspace ? (
          <WorkflowLog events={workspace.events} currentStep={workspace.currentStep} />
        ) : null}
      </WorkspaceMessage>
    );
  }
  if (workspace.status === "failed") {
    return (
      <WorkspaceMessage
        title={
          workspace.failure?.kind === "retriable"
            ? "Обработка прервана"
            : "Материал обработать не удалось"
        }
        text={workspace.failure?.message ?? "Неизвестная ошибка обработки."}
      >
        {workspace.failure?.manualResumeAllowed ? (
          <button
            className="primary-link"
            type="button"
            disabled={resuming}
            onClick={() => {
              void resume();
            }}
          >
            {resuming ? "Продолжаем…" : "Продолжить с контрольной точки"}
          </button>
        ) : null}
        <WorkflowLog events={workspace.events} currentStep={workspace.currentStep} />
      </WorkspaceMessage>
    );
  }
  if (workspace.unknownLayoutReview) {
    return (
      <main className="review-page">
        <header className="review-header">
          <div>
            <p className="eyebrow">Проверка импорта</p>
            <h1>{workspace.source.title}</h1>
          </div>
          <Link className="secondary-link" href="/imports/new">
            Новый импорт
          </Link>
        </header>
        <div className="review-layout">
          <SourceViewer
            kind={workspace.source.kind}
            signedUrl={workspace.source.signedUrl}
            rawText={null}
          />
          <div className="review-results">
            <UnknownLayoutReview review={workspace.unknownLayoutReview} onSaved={refresh} />
            <WorkflowLog events={workspace.events} currentStep={workspace.currentStep} />
          </div>
        </div>
      </main>
    );
  }
  if (!workspace.draft)
    return (
      <WorkspaceMessage
        title="Черновик ещё не создан"
        text="Проверьте состояние workflow и повторите обновление."
      />
    );

  const openIssues = workspace.issues.filter((issue) => issue.resolution === "open");
  const openBlockingIssues = openIssues.filter((issue) => issue.severity === "blocking");
  const unverifiedAnswerCount = workspace.draft.payload.groups.reduce(
    (sum, group) =>
      sum +
      group.exercises.reduce(
        (exerciseSum, exercise) =>
          exerciseSum +
          exercise.answerFields.filter(
            (answer) => answer.reviewStatus !== "verified" || answer.acceptedValues.length === 0
          ).length,
        0
      ),
    0
  );
  const modelSuggestionsSkipped = workspace.events.some(
    (event) => event.type === "model-answer-suggestions-skipped"
  );
  return (
    <main className="review-page">
      <header className="review-header">
        <div>
          <p className="eyebrow">Проверка импорта</p>
          <h1>{workspace.source.title}</h1>
          <p>
            Сверьте распарсенные задания с{" "}
            {workspace.source.kind === "text" ? "исходным текстом" : "оригинальным PDF"} и внесите
            необходимые правки.
          </p>
        </div>
        <div className="review-header-actions">
          <Link className="secondary-link" href="/imports/new">
            Новый импорт
          </Link>
          {workspace.status === "ready_to_publish" ? (
            <Link className="primary-link" href={`/imports/${runId}/publish`}>
              Опубликовать урок
            </Link>
          ) : workspace.status === "completed" ? (
            <Link className="primary-link" href="/lessons">
              Открыть опубликованные уроки
            </Link>
          ) : (
            <button
              className="secondary-link"
              type="button"
              onClick={() => {
                void refresh();
              }}
            >
              Проверить готовность
            </button>
          )}
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {modelSuggestionsSkipped ? (
        <p className="model-fallback-notice" role="status">
          ИИ-подсказки ответов сейчас недоступны или пришли не полностью. Черновик сохранён без них
          — заполните и подтвердите правильные ответы вручную.
        </p>
      ) : null}
      <section
        className={
          workspace.status === "ready_to_publish" ? "publication-gate is-ready" : "publication-gate"
        }
        aria-live="polite"
      >
        <div>
          <p className="eyebrow">Публикация</p>
          <h2>
            {workspace.status === "ready_to_publish"
              ? "Урок готов к публикации"
              : workspace.status === "completed"
                ? "Урок уже опубликован"
                : "Перед публикацией завершите проверку"}
          </h2>
          {workspace.status !== "ready_to_publish" && workspace.status !== "completed" ? (
            <p>
              Непроверенных ответов: {unverifiedAnswerCount}. Открытых блокирующих проблем:{" "}
              {openBlockingIssues.length}.
            </p>
          ) : (
            <p>Все обязательные ответы проверены, блокирующих проблем нет.</p>
          )}
          <div className="publication-metrics" aria-label="Готовность урока">
            <span className={unverifiedAnswerCount === 0 ? "is-clear" : "has-pending"}>
              <strong>{unverifiedAnswerCount}</strong>
              ответов требуют проверки
            </span>
            <span className={openBlockingIssues.length === 0 ? "is-clear" : "has-blockers"}>
              <strong>{openBlockingIssues.length}</strong>
              блокирующих проблем
            </span>
          </div>
        </div>
        {workspace.status === "ready_to_publish" ? (
          <Link className="primary-link" href={"/imports/" + runId + "/publish"}>
            Перейти к публикации
          </Link>
        ) : workspace.status === "completed" ? (
          <Link className="secondary-link" href="/lessons">
            Мои уроки
          </Link>
        ) : (
          <a className="secondary-link" href="#draft-title">
            Проверить ответы
          </a>
        )}
      </section>
      <div className="review-layout">
        <SourceViewer
          kind={workspace.source.kind}
          signedUrl={workspace.source.signedUrl}
          rawText={workspace.documentIr?.blocks?.[0]?.rawText ?? null}
        />
        <div className="review-results">
          <ExerciseDraftEditor
            draft={workspace.draft.payload}
            revision={workspace.draft.revision}
            issues={workspace.issues}
            onSaved={async () => {
              await refresh();
            }}
          />
        </div>
      </div>
    </main>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "неизвестно"
    : new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "medium"
      }).format(date);
}

function WorkspaceMessage({
  title,
  text,
  progress = false,
  children
}: {
  readonly title: string;
  readonly text: string;
  readonly progress?: boolean;
  readonly children?: React.ReactNode;
}) {
  return (
    <main className="workspace-message">
      <p className="eyebrow">Lingua Bloom</p>
      <h1>{title}</h1>
      <p>{text}</p>
      {progress ? (
        <div className="loading-line" aria-label="Обработка продолжается">
          <span />
        </div>
      ) : null}
      {children}
    </main>
  );
}
