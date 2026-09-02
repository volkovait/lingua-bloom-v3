"use client";

import type {
  TeacherClassifiableInteractionKind,
  UnknownLayoutReview as UnknownLayoutReviewContract
} from "@lingua-bloom/contracts";
import { useState } from "react";

type CandidateAction =
  | { readonly action: "classify"; readonly interactionKind: TeacherClassifiableInteractionKind }
  | { readonly action: "mark"; readonly outcome: "reference" | "example" }
  | { readonly action: "exclude" };

const actionOptions = [
  { value: "singleChoice", label: "Выбор одного ответа" },
  { value: "wordOrder", label: "Расставить слова по порядку" },
  { value: "bracketGap", label: "Заполнить пропуск формой слова" },
  { value: "oddOneOut", label: "Найти лишний вариант" },
  { value: "inlineGap", label: "Вписать ответ в пропуск" },
  { value: "shortText", label: "Короткий свободный ответ" },
  { value: "reference", label: "Справочный материал" },
  { value: "example", label: "Пример — не оценивается" },
  { value: "exclude", label: "Исключить как шум или ошибку" }
] as const;

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
  const [aiPending, setAiPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(selectedActions: Record<string, CandidateAction> = actions) {
    const selected = candidates.filter((candidate) => selectedActions[candidate.id]);
    if (selected.length === 0) {
      setMessage("Выберите действие хотя бы для одного фрагмента.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/imports/${encodeURIComponent(review.runId)}/layout-review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: review.revision,
            idempotencyKey: crypto.randomUUID(),
            decisions: selected.map((candidate) => ({
              candidateId: candidate.id,
              ...selectedActions[candidate.id],
              reason: "Классификация подтверждена преподавателем"
            }))
          })
        }
      );
      const result = (await response.json().catch(() => null)) as {
        readonly message?: string;
        readonly code?: string;
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
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить классификацию.");
    } finally {
      setPending(false);
    }
  }

  async function requestAiSuggestions() {
    setAiPending(true);
    setMessage(null);
    const endpoint = `/api/imports/${encodeURIComponent(review.runId)}/layout-review/suggest`;
    try {
      const preflightResponse = await fetch(endpoint, { cache: "no-store" });
      const preflightResult = (await preflightResponse.json().catch(() => null)) as {
        readonly message?: string;
        readonly preflight?: {
          readonly planHash: string;
          readonly candidateCount: number;
          readonly requestCount: number;
          readonly estimatedTokens: number;
          readonly estimatedCostRub: number;
          readonly hardLimitRub: number;
          readonly exceedsHardLimit: boolean;
        };
      } | null;
      if (!preflightResponse.ok || !preflightResult?.preflight)
        throw new Error(
          preflightResult?.message ?? "Не удалось рассчитать стоимость классификации."
        );
      const plan = preflightResult.preflight;
      if (plan.exceedsHardLimit)
        throw new Error(
          `Оценка ${plan.estimatedCostRub.toFixed(2)} ₽ превышает лимит ${plan.hardLimitRub.toFixed(2)} ₽.`
        );
      const confirmed = window.confirm(
        [
          `Фрагментов: ${String(plan.candidateCount)}.`,
          `Запросов к модели: ${String(plan.requestCount)}.`,
          `Оценка токенов: ${String(plan.estimatedTokens)}.`,
          `Примерная стоимость: до ${plan.estimatedCostRub.toFixed(2)} ₽.`,
          "ИИ только предложит варианты. Сохранение произойдёт после вашей проверки.",
          "Продолжить?"
        ].join("\n")
      );
      if (!confirmed) {
        setMessage("ИИ-классификация отменена. Платный запрос не выполнялся.");
        return;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: review.revision,
          confirmedPlanHash: plan.planHash
        })
      });
      const result = (await response.json().catch(() => null)) as {
        readonly message?: string;
        readonly suggestions?: readonly {
          readonly candidateId: string;
          readonly classification:
            TeacherClassifiableInteractionKind | "reference" | "example" | "exclude";
        }[];
        readonly reused?: boolean;
      } | null;
      if (!response.ok || !result?.suggestions)
        throw new Error(result?.message ?? "ИИ-классификацию получить не удалось.");
      const suggestions = result.suggestions;
      setActions((current) => ({
        ...current,
        ...Object.fromEntries(
          suggestions.map((suggestion) => [
            suggestion.candidateId,
            actionFromValue(suggestion.classification)
          ])
        )
      }));
      setMessage(
        result.reused
          ? "Загружены ранее рассчитанные предложения ИИ. Проверьте их перед сохранением."
          : "ИИ предложил классификацию. Проверьте каждый фрагмент перед сохранением."
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ИИ-классификацию получить не удалось.");
    } finally {
      setAiPending(false);
    }
  }

  return (
    <section className="unknown-layout-review" aria-labelledby="unknown-layout-title">
      <p className="eyebrow">Нужна классификация</p>
      <h2 id="unknown-layout-title">Найдена незнакомая структура материала</h2>
      <p>
        Для каждого фрагмента выберите тип задания, справочный outcome или исключение. ИИ может
        предложить варианты, но они сохранятся только после вашей проверки.
      </p>
      <div className="unknown-layout-actions">
        <button
          type="button"
          className="secondary-link"
          onClick={() => {
            setActions(
              Object.fromEntries(
                candidates.map((candidate) => [
                  candidate.id,
                  { action: "classify", interactionKind: "singleChoice" } satisfies CandidateAction
                ])
              )
            );
          }}
        >
          Все как «выбор одного ответа»
        </button>
        <button
          type="button"
          className="secondary-link"
          disabled={aiPending || pending}
          onClick={() => void requestAiSuggestions()}
        >
          {aiPending ? "Получаем предложения…" : "Предложить классификацию с ИИ"}
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
            <label>
              Как обработать фрагмент
              <select
                value={actionValue(actions[candidate.id])}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setActions((current) => {
                    if (value) return { ...current, [candidate.id]: actionFromValue(value) };
                    return Object.fromEntries(
                      Object.entries(current).filter(([id]) => id !== candidate.id)
                    );
                  });
                }}
              >
                <option value="">Выберите вариант</option>
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ol>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="primary-link"
        disabled={pending || aiPending}
        onClick={() => void save(actions)}
      >
        {pending ? "Сохраняем…" : "Сохранить подтверждённые решения"}
      </button>
    </section>
  );
}

function actionFromValue(value: string): CandidateAction {
  if (value === "reference" || value === "example") return { action: "mark", outcome: value };
  if (value === "exclude") return { action: "exclude" };
  if (
    value === "singleChoice" ||
    value === "wordOrder" ||
    value === "bracketGap" ||
    value === "oddOneOut" ||
    value === "inlineGap" ||
    value === "shortText"
  )
    return { action: "classify", interactionKind: value };
  throw new Error("UNKNOWN_LAYOUT_ACTION");
}

function actionValue(action: CandidateAction | undefined): string {
  if (!action) return "";
  if (action.action === "classify") return action.interactionKind;
  if (action.action === "mark") return action.outcome;
  return "exclude";
}
