"use client";

import Link from "next/link";
import { useState } from "react";

interface PublishedResult {
  readonly lessonId: string;
  readonly publicLessonId: string;
  readonly version: number;
}

interface PublishFailure {
  readonly code?: string;
  readonly message?: string;
  readonly reasons?: readonly string[];
}

export function PublishConfirmation({ runId }: { readonly runId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const [published, setPublished] = useState<PublishedResult | null>(null);

  async function publish() {
    if (!confirmed) return;
    setPending(true);
    setError(null);
    setReasons([]);
    try {
      const response = await fetch(`/api/imports/${encodeURIComponent(runId)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmPermanentPublicAccess: true })
      });
      const result = (await response.json()) as PublishedResult & PublishFailure;
      if (!response.ok) {
        setReasons(result.reasons ?? []);
        if (result.code === "PUBLISH_FAILED") {
          throw new Error("Не удалось опубликовать урок. Повторите попытку позже.");
        }
        throw new Error(result.message ?? "Публикация заблокирована.");
      }
      setPublished(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось опубликовать урок.");
    } finally {
      setPending(false);
    }
  }

  if (published) {
    return (
      <section className="publish-card publish-success">
        <p className="eyebrow">Версия {published.version}</p>
        <h1>Урок опубликован</h1>
        <p>Ссылка ведёт на последнюю опубликованную версию и доступна ученикам без регистрации.</p>
        <div className="publish-actions">
          <Link className="primary-link" href={`/learn/${published.publicLessonId}`}>
            Открыть урок
          </Link>
          <Link className="secondary-link" href={`/lessons/${published.lessonId}/versions`}>
            История версий
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="publish-card">
      <p className="eyebrow">Публичный доступ</p>
      <h1>Опубликовать урок?</h1>
      <p>После публикации урок будет доступен по ссылке</p>
      <label className="permanent-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
          }}
        />
        <span>Я понимаю, что публичная ссылка сохраняет доступ к актуальной версии урока.</span>
      </label>
      {reasons.length > 0 ? (
        <div className="publication-reasons" role="alert">
          <p>Что нужно исправить:</p>
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{formatPublicationReason(reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="publish-actions">
        <button
          className="primary-link"
          type="button"
          disabled={!confirmed || pending}
          onClick={() => {
            void publish();
          }}
        >
          {pending ? "Публикуем…" : "Опубликовать версию"}
        </button>
        <Link className="text-link" href={`/imports/${runId}/review`}>
          Вернуться к проверке
        </Link>
      </div>
    </section>
  );
}

function formatPublicationReason(reason: string): string {
  const labels: Record<string, string> = {
    "blocking issues remain open": "Остались нерешённые блокирующие проблемы.",
    "unsupported additions remain": "В уроке остались элементы без подтверждённого источника.",
    "answers remain unverified": "Не все правильные ответы подтверждены преподавателем.",
    "draft and DocumentIR lineage differ": "Черновик связан не с той версией исходного документа.",
    "publication review is incomplete": "Проверка готовности урока ещё не завершена."
  };
  if (labels[reason]) return labels[reason];
  if (reason.startsWith("invalid SourceRef ")) {
    return (
      "Не найдена ссылка на исходный фрагмент: " + reason.slice("invalid SourceRef ".length) + "."
    );
  }
  if (reason.startsWith("SourceRef range exceeds block ")) {
    return (
      "Диапазон ссылки выходит за границы исходного фрагмента: " +
      reason.slice("SourceRef range exceeds block ".length) +
      "."
    );
  }
  return reason;
}
