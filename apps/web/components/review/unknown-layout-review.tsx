"use client";

import type { UnknownLayoutReview as UnknownLayoutReviewContract } from "@lingua-bloom/contracts";
import { useState } from "react";

type CandidateAction = "singleChoice" | "exclude";

export function UnknownLayoutReview({
  review,
  onSaved
}: {
  readonly review: UnknownLayoutReviewContract;
  readonly onSaved: () => Promise<unknown>;
}) {
  const decisions = review.decisions;
  const decided = new Set(decisions.map((decision) => decision.candidateId));
  const candidates = review.candidates.filter((candidate) => !decided.has(candidate.id));
  const [actions, setActions] = useState<Record<string, CandidateAction>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(
    selectedActions: Record<string, CandidateAction> = actions,
    requestSuggestions = false
  ) {
    const selected = candidates.filter((candidate) => selectedActions[candidate.id]);
    if (selected.length === 0) {
      setError("Выберите действие хотя бы для одного фрагмента.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/imports/${encodeURIComponent(review.runId)}/layout-review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: review.revision,
            idempotencyKey: crypto.randomUUID(),
            decisions: selected.map((candidate) =>
              selectedActions[candidate.id] === "exclude"
                ? {
                    candidateId: candidate.id,
                    action: "exclude",
                    reason: "Фрагмент не является заданием для урока"
                  }
                : {
                    candidateId: candidate.id,
                    action: "classify",
                    interactionKind: "singleChoice",
                    reason: "Структура задания подтверждена преподавателем"
                  }
            )
          })
        }
      );
      const result = (await response.json().catch(() => null)) as {
        readonly message?: string;
        readonly code?: string;
        readonly draftRevision?: number | null;
      } | null;
      if (!response.ok) {
        throw new Error(
          result?.message ??
            (result?.code === "LAYOUT_REVIEW_VERSION_CONFLICT"
              ? "Решения изменены в другой вкладке. Перезагрузите страницу."
              : "Не удалось сохранить классификацию.")
        );
      }
      setActions({});
      if (requestSuggestions && result?.draftRevision) {
        const suggestionResponse = await fetch(
          `/api/imports/${encodeURIComponent(review.runId)}/suggest-answers`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              expectedRevision: result.draftRevision,
              idempotencyKey: crypto.randomUUID()
            })
          }
        );
        if (!suggestionResponse.ok) {
          await onSaved();
          return;
        }
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить классификацию.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="unknown-layout-review" aria-labelledby="unknown-layout-title">
      <p className="eyebrow">Нужна классификация</p>
      <h2 id="unknown-layout-title">Найдена незнакомая структура заданий</h2>
      <p>
        Импорт безопасно остановлен до создания черновика. Отметьте задания с выбором ответа и
        исключите справочные или ошибочно найденные фрагменты.
      </p>
      <div className="unknown-layout-actions">
        <button
          type="button"
          className="secondary-link"
          onClick={() => {
            setActions(
              Object.fromEntries(candidates.map((candidate) => [candidate.id, "singleChoice"]))
            );
          }}
        >
          Все как «выбор из вариантов»
        </button>
        <button
          type="button"
          className="primary-link"
          disabled={pending}
          onClick={() => {
            const allSingleChoice = Object.fromEntries(
              candidates.map((candidate) => [candidate.id, "singleChoice" as const])
            );
            setActions(allSingleChoice);
            void save(allSingleChoice, true);
          }}
        >
          {pending ? "Обрабатываем…" : "Все как выбор + предложить ответы с ИИ"}
        </button>
        <span>
          Решено: {decisions.length} из {review.candidates.length}
        </span>
      </div>
      <ol>
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            {candidate.sourceOrdinal != null ? <strong>№ {candidate.sourceOrdinal}</strong> : null}
            <pre>{candidate.rawPrompt}</pre>
            <fieldset>
              <legend>Как обработать фрагмент</legend>
              <label>
                <input
                  type="radio"
                  name={`candidate-${candidate.id}`}
                  checked={actions[candidate.id] === "singleChoice"}
                  onChange={() => {
                    setActions((current) => ({ ...current, [candidate.id]: "singleChoice" }));
                  }}
                />
                Задание с выбором ответа
              </label>
              <label>
                <input
                  type="radio"
                  name={`candidate-${candidate.id}`}
                  checked={actions[candidate.id] === "exclude"}
                  onChange={() => {
                    setActions((current) => ({ ...current, [candidate.id]: "exclude" }));
                  }}
                />
                Исключить из урока
              </label>
            </fieldset>
          </li>
        ))}
      </ol>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="primary-link"
        disabled={pending}
        onClick={() => void save(actions)}
      >
        {pending ? "Сохраняем…" : "Сохранить выбранные решения"}
      </button>
    </section>
  );
}
