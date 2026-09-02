"use client";

import type { ReviewDraft } from "@lingua-bloom/contracts";
import { useMemo, useState } from "react";

import {
  getEntityIssueState,
  getVisibleReviewIssues,
  issueMessage
} from "@/src/review/issue-highlighting";
import { splitInlineChoicePrompt } from "@/src/lesson/inline-choice";

export interface ReviewIssue {
  readonly id: string;
  readonly code: string;
  readonly severity: "info" | "warning" | "blocking";
  readonly resolution: "open" | "resolved" | "acceptedRisk";
  readonly message: string;
  readonly entityIds: readonly string[];
}

interface ExerciseCreateDraft {
  prompt: string;
  interactionKind: ReviewDraft["groups"][number]["exercises"][number]["interactionKind"];
  options: string;
  answers: string;
}

function emptyExerciseCreate(): ExerciseCreateDraft {
  return {
    prompt: "",
    interactionKind: "inlineGap",
    options: "",
    answers: ""
  };
}

export function ExerciseDraftEditor({
  draft,
  revision,
  issues,
  onSaved
}: {
  readonly draft: ReviewDraft;
  readonly revision: number;
  readonly issues: readonly ReviewIssue[];
  readonly onSaved: () => Promise<void>;
}) {
  const openIssues = useMemo(() => issues.filter((issue) => issue.resolution === "open"), [issues]);
  const exercises = useMemo(() => draft.groups.flatMap((group) => group.exercises), [draft]);
  const answerEntries = useMemo(
    () =>
      exercises.flatMap((exercise) =>
        exercise.answerFields.map((field) => ({
          exerciseId: exercise.id,
          field,
          issue: openIssues.find((issue) => issue.entityIds.includes(field.id))
        }))
      ),
    [exercises, openIssues]
  );
  const firstPendingExerciseId =
    exercises.find((exercise) =>
      exercise.answerFields.some((field) => field.reviewStatus !== "verified")
    )?.id ??
    exercises[0]?.id ??
    null;
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    firstPendingExerciseId
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmedSuggestions, setConfirmedSuggestions] = useState<Record<string, boolean>>({});
  const [exerciseEdits, setExerciseEdits] = useState<
    Record<string, { prompt: string; options: Record<string, string> }>
  >({});
  const [exerciseCreates, setExerciseCreates] = useState<Record<string, ExerciseCreateDraft>>({});
  const [exerciseDeletes, setExerciseDeletes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const visibleIssues = useMemo(
    () =>
      getVisibleReviewIssues(
        openIssues,
        new Set(
          Object.entries(confirmedSuggestions)
            .filter(([, confirmed]) => confirmed)
            .map(([fieldId]) => fieldId)
        )
      ),
    [confirmedSuggestions, openIssues]
  );

  const modelSuggestionIds = answerEntries
    .filter(({ field }) => field.provenance === "modelInferred")
    .map(({ field }) => field.id);
  const confirmedModelCount = modelSuggestionIds.filter((id) => confirmedSuggestions[id]).length;
  const unresolvedWithoutSuggestion = answerEntries.filter(
    ({ field }) => field.reviewStatus !== "verified" && field.provenance !== "modelInferred"
  ).length;
  const verifiedAnswerCount = answerEntries.filter(
    ({ field }) => field.reviewStatus === "verified"
  ).length;
  const queuedChangeCount =
    Object.keys(answers).length +
    Object.values(confirmedSuggestions).filter(Boolean).length +
    Object.keys(exerciseEdits).length +
    Object.keys(exerciseCreates).length +
    exerciseDeletes.length;

  async function requestAiSuggestions() {
    setSuggesting(true);
    setMessage(null);
    try {
      const endpoint = `/api/imports/${encodeURIComponent(readRunId())}/suggest-answers`;
      const preflightResponse = await fetch(endpoint, { cache: "no-store" });
      const preflightResult = (await preflightResponse.json().catch(() => null)) as {
        readonly message?: string;
        readonly preflight?: {
          readonly planHash: string;
          readonly answerFieldCount: number;
          readonly batchCount: number;
          readonly estimatedTokens: number;
          readonly estimatedCostUsd: number;
          readonly requiresConfirmation: boolean;
          readonly exceedsHardLimit: boolean;
          readonly hardLimitUsd: number;
        };
      } | null;
      if (!preflightResponse.ok || !preflightResult?.preflight) {
        throw new Error(
          preflightResult?.message ?? "Не удалось рассчитать стоимость ИИ-подсказок."
        );
      }
      const plan = preflightResult.preflight;
      if (plan.exceedsHardLimit) {
        throw new Error(
          `Оценка ${plan.estimatedCostUsd.toFixed(2)} превышает лимит ${plan.hardLimitUsd.toFixed(2)}. Разбейте материал или заполните ответы вручную.`
        );
      }
      if (
        plan.requiresConfirmation &&
        !window.confirm(
          [
            `Будет обработано полей: ${String(plan.answerFieldCount)}.`,
            `Платных запросов: ${String(plan.batchCount)}.`,
            `Оценка токенов: ${String(plan.estimatedTokens)}.`,
            `Ориентировочная стоимость: до ${plan.estimatedCostUsd.toFixed(2)}.`,
            "Продолжить?"
          ].join("\n")
        )
      ) {
        setMessage("Запрос к модели отменён. Деньги не списывались.");
        return;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          idempotencyKey: crypto.randomUUID(),
          ...(plan.requiresConfirmation ? { confirmedPlanHash: plan.planHash } : {})
        })
      });
      const result = (await response.json().catch(() => null)) as {
        readonly message?: string;
        readonly suggestionCount?: number;
        readonly actualCostUsd?: number | null;
      } | null;
      if (!response.ok) throw new Error(result?.message ?? "Не удалось получить ИИ-подсказки.");
      setMessage(
        `ИИ предложил ответы: ${String(result?.suggestionCount ?? 0)}. Фактическая стоимость: ${
          result?.actualCostUsd == null ? "не сообщена" : result.actualCostUsd.toFixed(2)
        }. Проверьте каждый ответ.`
      );
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Не удалось получить ИИ-подсказки.");
    } finally {
      setSuggesting(false);
    }
  }

  function confirmSuggestions(ids: readonly string[]) {
    setConfirmedSuggestions((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, true]))
    }));
    setMessage(null);
  }

  async function saveReview() {
    const unconfirmedSuggestions = answerEntries
      .filter(({ exerciseId }) => !exerciseDeletes.includes(exerciseId))
      .filter(
        ({ field }) => field.provenance === "modelInferred" && !confirmedSuggestions[field.id]
      );
    if (unconfirmedSuggestions.length > 0) {
      setMessage(
        `Подтвердите все ответы, предложенные ИИ: осталось ${String(unconfirmedSuggestions.length)}.`
      );
      return;
    }

    const missingAnswers: string[] = [];
    const answerReviews = answerEntries
      .filter(({ exerciseId }) => !exerciseDeletes.includes(exerciseId))
      .flatMap(({ field, issue }) => {
        const original = field.acceptedValues.join(" | ").trim();
        const value = (answers[field.id] ?? original).trim();
        const changed = value !== original;
        const requiresReview = field.reviewStatus !== "verified" || issue != null;
        const confirmedModelSuggestion =
          field.provenance === "modelInferred" && confirmedSuggestions[field.id];
        if (!value && (changed || requiresReview || confirmedModelSuggestion)) {
          missingAnswers.push(field.id);
          return [];
        }
        if (!changed && !requiresReview && !confirmedModelSuggestion) return [];
        return [
          {
            answerFieldId: field.id,
            issueId: issue?.id ?? null,
            decision: changed ? ("edit" as const) : ("confirm" as const),
            reason: changed
              ? "Правильный ответ исправлен преподавателем"
              : "Правильный ответ подтверждён преподавателем",
            replacementValue: value
          }
        ];
      });
    if (missingAnswers.length > 0) {
      setMessage("Заполните все ответы, требующие проверки.");
      return;
    }

    const edits = Object.entries(exerciseEdits).map(([exerciseId, edit]) => ({
      exerciseId,
      prompt: edit.prompt.trim(),
      options: Object.entries(edit.options).map(([id, value]) => ({ id, value }))
    }));
    const creates = Object.entries(exerciseCreates).flatMap(([groupId, creation]) => {
      const prompt = creation.prompt.trim();
      const answerValues = creation.answers
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!prompt || answerValues.length === 0) return [];
      return [
        {
          groupId,
          prompt,
          interactionKind: creation.interactionKind,
          options: creation.options
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          answerValues
        }
      ];
    });
    const deletes = exerciseDeletes.map((exerciseId) => ({
      exerciseId,
      reason: "Задание удалено преподавателем"
    }));
    if (answerReviews.length + edits.length + creates.length + deletes.length === 0) {
      setMessage("Нет новых изменений для сохранения.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/imports/${encodeURIComponent(readRunId())}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftVersion: revision,
          idempotencyKey: crypto.randomUUID(),
          decisions: [],
          answerReviews,
          exerciseEdits: edits,
          exerciseCreates: creates,
          exerciseDeletes: deletes
        })
      });
      const result = (await response.json()) as { code?: string; message?: string };
      if (response.status === 409 && result.code === "DRAFT_VERSION_CONFLICT") {
        setMessage("Черновик изменён в другой вкладке. Перезагрузите страницу перед продолжением.");
        return;
      }
      if (!response.ok) throw new Error(result.message ?? "Не удалось сохранить решения.");
      setAnswers({});
      setConfirmedSuggestions({});
      setExerciseEdits({});
      setExerciseCreates({});
      setExerciseDeletes([]);
      setMessage("Решения сохранены как ответы преподавателя.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решения.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="review-panel draft-panel" aria-labelledby="draft-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Черновик · редакция {revision}</p>
          <h2 id="draft-title">Извлечённые упражнения</h2>
          {modelSuggestionIds.length > 0 ? (
            <p className="suggestion-progress">
              Подтверждено ИИ-ответов: {confirmedModelCount} из {modelSuggestionIds.length}
            </p>
          ) : null}
        </div>
        <div className="draft-heading-actions">
          <div className="review-editor-summary" aria-label="Сводка черновика">
            <span>
              <strong>{exercises.length}</strong>
              заданий
            </span>
            <span>
              <strong>{verifiedAnswerCount}</strong>
              из {answerEntries.length} ответов проверено
            </span>
          </div>
          {unresolvedWithoutSuggestion > 0 ? (
            <button
              className="secondary-link compact-action"
              type="button"
              disabled={suggesting}
              onClick={() => {
                void requestAiSuggestions();
              }}
            >
              {suggesting ? "ИИ подбирает ответы…" : "Предложить ответы с ИИ"}
            </button>
          ) : null}
          {modelSuggestionIds.length > confirmedModelCount ? (
            <button
              className="secondary-link compact-action"
              type="button"
              onClick={() => {
                confirmSuggestions(modelSuggestionIds);
              }}
            >
              Подтвердить все ИИ-ответы
            </button>
          ) : null}
        </div>
      </div>
      <div className="draft-groups">
        {draft.groups.map((group) => (
          <section className="exercise-group" key={group.id}>
            <div className="exercise-group-heading">
              <div>
                <h3>
                  {group.ordinal}. {group.instruction}
                </h3>
                {group.completeness === "partial" ? (
                  <small className="partial-group-note">
                    Неполная группа: начало задания отсутствует
                  </small>
                ) : null}
              </div>
              <button
                className="secondary-link compact-action"
                type="button"
                onClick={() => {
                  setExerciseCreates((current) =>
                    current[group.id]
                      ? Object.fromEntries(
                          Object.entries(current).filter(([id]) => id !== group.id)
                        )
                      : {
                          ...current,
                          [group.id]: {
                            prompt: "",
                            interactionKind: "inlineGap",
                            options: "",
                            answers: ""
                          }
                        }
                  );
                }}
              >
                {exerciseCreates[group.id] ? "Отменить добавление" : "Добавить задание"}
              </button>
            </div>
            {(group.sharedResources ?? []).map((resource) => (
              <aside
                aria-label={resource.label ?? "Слова для заданий"}
                className="shared-word-bank"
                key={resource.id}
              >
                {resource.label ? <strong>{resource.label}</strong> : null}
                <ul>
                  {resource.entries.map((entry) => (
                    <li key={entry.id}>{entry.value}</li>
                  ))}
                </ul>
              </aside>
            ))}
            {exerciseCreates[group.id] ? (
              <div className="exercise-create-form">
                <label>
                  <span>Формулировка нового задания</span>
                  <textarea
                    value={exerciseCreates[group.id]?.prompt ?? ""}
                    onChange={(event) => {
                      setExerciseCreates((current) => ({
                        ...current,
                        [group.id]: {
                          ...(current[group.id] ?? emptyExerciseCreate()),
                          prompt: event.target.value
                        }
                      }));
                    }}
                  />
                </label>
                <label>
                  <span>Тип задания</span>
                  <select
                    value={exerciseCreates[group.id]?.interactionKind ?? "inlineGap"}
                    onChange={(event) => {
                      setExerciseCreates((current) => ({
                        ...current,
                        [group.id]: {
                          ...(current[group.id] ?? emptyExerciseCreate()),
                          interactionKind: event.target
                            .value as ExerciseCreateDraft["interactionKind"]
                        }
                      }));
                    }}
                  >
                    <option value="inlineGap">Пропуски в тексте</option>
                    <option value="singleChoice">Один вариант</option>
                    <option value="wordOrder">Порядок слов</option>
                    <option value="bracketGap">Пропуск со словом в скобках</option>
                    <option value="oddOneOut">Лишнее слово</option>
                  </select>
                </label>
                <label>
                  <span>Варианты, по одному на строку (необязательно)</span>
                  <textarea
                    value={exerciseCreates[group.id]?.options ?? ""}
                    onChange={(event) => {
                      setExerciseCreates((current) => ({
                        ...current,
                        [group.id]: {
                          ...(current[group.id] ?? emptyExerciseCreate()),
                          options: event.target.value
                        }
                      }));
                    }}
                  />
                </label>
                <label>
                  <span>Правильные ответы, по одному полю на строку</span>
                  <textarea
                    value={exerciseCreates[group.id]?.answers ?? ""}
                    onChange={(event) => {
                      setExerciseCreates((current) => ({
                        ...current,
                        [group.id]: {
                          ...(current[group.id] ?? emptyExerciseCreate()),
                          answers: event.target.value
                        }
                      }));
                    }}
                  />
                </label>
                <small>Новое задание и ответы сохранятся с provenance teacherSupplied.</small>
              </div>
            ) : null}
            {group.exercises.map((exercise) => {
              const isExpanded = exercise.id === selectedExerciseId;
              const exerciseIssueState = getEntityIssueState(visibleIssues, [
                exercise.id,
                ...exercise.options.map((option) => option.id),
                ...exercise.answerFields.map((field) => field.id)
              ]);
              const suggestionIds = exercise.answerFields
                .filter((field) => field.provenance === "modelInferred")
                .map((field) => field.id);
              const confirmedCount = suggestionIds.filter((id) => confirmedSuggestions[id]).length;
              const inlineChoice =
                exercise.interactionKind === "singleChoice" && exercise.options.length > 0
                  ? splitInlineChoicePrompt(exerciseEdits[exercise.id]?.prompt ?? exercise.prompt)
                  : null;
              return (
                <article
                  className={`exercise-card clickable-exercise${isExpanded ? " is-expanded" : ""}${
                    exerciseIssueState.severity
                      ? ` has-validation-issue issue-${exerciseIssueState.severity}`
                      : ""
                  }`}
                  data-validation-severity={exerciseIssueState.severity ?? undefined}
                  id={`exercise-${exercise.id}`}
                  key={exercise.id}
                >
                  <button
                    className="exercise-card-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={`exercise-body-${exercise.id}`}
                    onClick={() => {
                      setSelectedExerciseId(isExpanded ? null : exercise.id);
                    }}
                  >
                    <span className="exercise-number">{exercise.ordinal}</span>
                    <span className="exercise-toggle-copy">
                      <strong>{exercise.prompt || "Задание без формулировки"}</strong>
                      <small
                        className={
                          exerciseIssueState.severity
                            ? `exercise-state issue-${exerciseIssueState.severity}`
                            : "exercise-state"
                        }
                      >
                        {exerciseIssueState.issues[0]
                          ? `Проблема: ${issueMessage(exerciseIssueState.issues[0])}`
                          : suggestionIds.length > 0
                            ? `ИИ-ответы: ${String(confirmedCount)}/${String(suggestionIds.length)}`
                            : exercise.answerFields.every(
                                  (field) => field.reviewStatus === "verified"
                                )
                              ? "Ответ проверен"
                              : "Требует ответа"}
                      </small>
                    </span>
                    <span className="exercise-toggle-icon" aria-hidden="true">
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className="exercise-card-body" id={`exercise-body-${exercise.id}`}>
                      {exerciseIssueState.issues.length > 0 ? (
                        <div
                          className={`inline-validation-message issue-${exerciseIssueState.severity ?? "info"}`}
                          role={exerciseIssueState.severity === "blocking" ? "alert" : "status"}
                        >
                          <strong>
                            {exerciseIssueState.severity === "blocking"
                              ? "Нужно исправить перед публикацией"
                              : "Проверьте этот элемент"}
                          </strong>
                          <ul>
                            {exerciseIssueState.issues.map((issue) => (
                              <li key={issue.id}>{issueMessage(issue)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <label className="exercise-text-editor">
                        <span>Формулировка</span>
                        <textarea
                          value={exerciseEdits[exercise.id]?.prompt ?? exercise.prompt}
                          onChange={(event) => {
                            setExerciseEdits((current) => ({
                              ...current,
                              [exercise.id]: {
                                prompt: event.target.value,
                                options:
                                  current[exercise.id]?.options ??
                                  Object.fromEntries(
                                    exercise.options.map((option) => [option.id, option.value])
                                  )
                              }
                            }));
                          }}
                        />
                      </label>
                      {inlineChoice ? (
                        <p className="teacher-inline-choice-preview">
                          {inlineChoice.before}
                          <select
                            className="teacher-inline-choice"
                            aria-label={`Варианты задания ${String(exercise.ordinal)}`}
                            defaultValue=""
                          >
                            <option value="">Выберите…</option>
                            {exercise.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {exerciseEdits[exercise.id]?.options[option.id] ?? option.value}
                              </option>
                            ))}
                          </select>
                          {inlineChoice.after}
                        </p>
                      ) : null}
                      {exercise.options.length > 0 ? (
                        <details className="exercise-options-details">
                          <summary>Редактировать варианты ответа</summary>
                          <div className="exercise-options-editor">
                            {exercise.options.map((option) => {
                              const optionIssueState = getEntityIssueState(visibleIssues, [
                                option.id
                              ]);
                              return (
                                <label
                                  className={
                                    optionIssueState.severity
                                      ? `invalid-option issue-${optionIssueState.severity}`
                                      : undefined
                                  }
                                  key={option.id}
                                >
                                  <span>{option.ordinal}</span>
                                  <input
                                    aria-invalid={optionIssueState.severity === "blocking"}
                                    value={
                                      exerciseEdits[exercise.id]?.options[option.id] ?? option.value
                                    }
                                    onChange={(event) => {
                                      setExerciseEdits((current) => ({
                                        ...current,
                                        [exercise.id]: {
                                          prompt: current[exercise.id]?.prompt ?? exercise.prompt,
                                          options: {
                                            ...Object.fromEntries(
                                              exercise.options.map((item) => [item.id, item.value])
                                            ),
                                            ...current[exercise.id]?.options,
                                            [option.id]: event.target.value
                                          }
                                        }
                                      }));
                                    }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      ) : null}
                      <div className="exercise-meta">
                        <span className="provenance-badge">Источник привязан</span>
                        <span className="exercise-interaction-kind">
                          {interactionLabel(exercise.interactionKind)}
                        </span>
                      </div>
                      <div className="answer-fields">
                        {exercise.answerFields.map((field, index) => {
                          const fieldIssueState = getEntityIssueState(visibleIssues, [field.id]);
                          return (
                            <div
                              className={`answer-editor${
                                fieldIssueState.severity
                                  ? ` has-validation-issue issue-${fieldIssueState.severity}`
                                  : ""
                              }`}
                              key={field.id}
                            >
                              <label>
                                <span>
                                  Правильный ответ
                                  {exercise.answerFields.length > 1 ? ` ${String(index + 1)}` : ""}
                                  {field.provenance === "modelInferred" ? (
                                    <em className="model-suggestion-badge">
                                      ИИ-подсказка
                                      {field.confidence != null
                                        ? ` · ${String(Math.round(field.confidence * 100))}%`
                                        : ""}
                                    </em>
                                  ) : null}
                                </span>
                                <input
                                  aria-invalid={fieldIssueState.severity === "blocking"}
                                  value={answers[field.id] ?? field.acceptedValues.join(" | ")}
                                  placeholder="Введите проверенный ответ"
                                  onChange={(event) => {
                                    setAnswers((current) => ({
                                      ...current,
                                      [field.id]: event.target.value
                                    }));
                                  }}
                                />
                              </label>
                              {field.provenance === "modelInferred" ? (
                                <label className="answer-confirmation">
                                  <input
                                    type="checkbox"
                                    checked={confirmedSuggestions[field.id] ?? false}
                                    onChange={(event) => {
                                      setConfirmedSuggestions((current) => ({
                                        ...current,
                                        [field.id]: event.target.checked
                                      }));
                                    }}
                                  />
                                  Подтверждаю предложенный правильный ответ
                                </label>
                              ) : (
                                <small>
                                  {field.provenance === "teacherSupplied"
                                    ? "Сохранено как ответ преподавателя"
                                    : "Можно исправить; изменение сохранится как teacherSupplied"}
                                </small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {suggestionIds.length > confirmedCount ? (
                        <button
                          className="confirm-exercise-button"
                          type="button"
                          onClick={() => {
                            confirmSuggestions(suggestionIds);
                          }}
                        >
                          Подтвердить ИИ-ответы этого задания
                        </button>
                      ) : null}
                      <div className="exercise-card-footer">
                        <button
                          className="secondary-link compact-action exercise-delete"
                          type="button"
                          onClick={() => {
                            setExerciseDeletes((current) =>
                              current.includes(exercise.id)
                                ? current.filter((id) => id !== exercise.id)
                                : [...current, exercise.id]
                            );
                          }}
                        >
                          {exerciseDeletes.includes(exercise.id)
                            ? "Отменить удаление"
                            : "Удалить задание"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
      </div>
      <div className="review-save-bar">
        <div>
          {message ? (
            <p className="review-message" role="status">
              {message}
            </p>
          ) : (
            <p className="review-save-hint">
              {queuedChangeCount > 0
                ? `Несохранённых изменений: ${String(queuedChangeCount)}`
                : "Проверьте ответы и сохраните изменения."}
            </p>
          )}
        </div>
        <button
          className="review-save"
          type="button"
          disabled={pending}
          onClick={() => {
            void saveReview();
          }}
        >
          {pending ? "Сохраняем…" : "Сохранить проверку"}
        </button>
      </div>
    </section>
  );
}

function readRunId() {
  const match = window.location.pathname.match(/\/imports\/([^/]+)\/review/);
  if (!match?.[1]) throw new Error("Run ID отсутствует в адресе страницы");
  return decodeURIComponent(match[1]);
}

function interactionLabel(
  kind: ReviewDraft["groups"][number]["exercises"][number]["interactionKind"]
) {
  return {
    singleChoice: "Один вариант",
    wordOrder: "Порядок слов",
    bracketGap: "Заполнение пропуска",
    oddOneOut: "Лишнее слово",
    wordBankGap: "Банк слов",
    inlineGap: "Пропуски в тексте",
    shortText: "Короткий свободный ответ",
    matching: "Сопоставление",
    imageChoice: "Выбор изображения"
  }[kind];
}
