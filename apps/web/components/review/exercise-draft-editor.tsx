"use client";

import type { ReviewDraft } from "@lingua-bloom/contracts";
import { useEffect, useMemo, useState } from "react";

import type { ReviewIssue } from "./validation-issues";

export function ExerciseDraftEditor({
  draft,
  revision,
  issues,
  selectedIssueId,
  onIssueSelect,
  onSaved
}: {
  readonly draft: ReviewDraft;
  readonly revision: number;
  readonly issues: readonly ReviewIssue[];
  readonly selectedIssueId: string | null;
  readonly onIssueSelect: (issue: ReviewIssue) => void;
  readonly onSaved: () => Promise<void>;
}) {
  const openIssues = useMemo(() => issues.filter((issue) => issue.resolution === "open"), [issues]);
  const exercises = useMemo(() => draft.groups.flatMap((group) => group.exercises), [draft]);
  const answerEntries = useMemo(
    () =>
      exercises.flatMap((exercise) =>
        exercise.answerFields.map((field) => ({
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const modelSuggestionIds = answerEntries
    .filter(({ field }) => field.provenance === "modelInferred")
    .map(({ field }) => field.id);
  const confirmedModelCount = modelSuggestionIds.filter((id) => confirmedSuggestions[id]).length;

  useEffect(() => {
    if (!selectedIssueId) return;
    const issue = openIssues.find((candidate) => candidate.id === selectedIssueId);
    if (!issue) return;
    const exercise = exercises.find((candidate) =>
      candidate.answerFields.some((field) => issue.entityIds.includes(field.id))
    );
    if (exercise) setSelectedExerciseId(exercise.id);
  }, [exercises, openIssues, selectedIssueId]);

  function confirmSuggestions(ids: readonly string[]) {
    setConfirmedSuggestions((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, true]))
    }));
    setMessage(null);
  }

  async function saveReview() {
    const unconfirmedSuggestions = answerEntries.filter(
      ({ field }) => field.provenance === "modelInferred" && !confirmedSuggestions[field.id]
    );
    if (unconfirmedSuggestions.length > 0) {
      setMessage(
        `Подтвердите все ответы, предложенные ИИ: осталось ${String(unconfirmedSuggestions.length)}.`
      );
      return;
    }

    const missingAnswers: string[] = [];
    const answerReviews = answerEntries.flatMap(({ field, issue }) => {
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
    if (answerReviews.length + edits.length === 0) {
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
          exerciseEdits: edits
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
          <span className="provenance-badge">{exercises.length} заданий</span>
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
            <h3>
              {group.ordinal}. {group.instruction}
            </h3>
            {group.exercises.map((exercise) => {
              const exerciseIssues = openIssues.filter((issue) =>
                issue.entityIds.some((id) => exercise.answerFields.some((field) => field.id === id))
              );
              const isExpanded = exercise.id === selectedExerciseId;
              const suggestionIds = exercise.answerFields
                .filter((field) => field.provenance === "modelInferred")
                .map((field) => field.id);
              const confirmedCount = suggestionIds.filter((id) => confirmedSuggestions[id]).length;
              return (
                <article
                  className={`exercise-card clickable-exercise${isExpanded ? " is-expanded" : ""}${exerciseIssues.some((issue) => issue.id === selectedIssueId) ? " is-selected" : ""}`}
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
                      const issue = exerciseIssues[0];
                      if (issue) onIssueSelect(issue);
                    }}
                  >
                    <span className="exercise-number">{exercise.ordinal}</span>
                    <span className="exercise-toggle-copy">
                      <strong>{exercise.prompt || "Задание без формулировки"}</strong>
                      <small>
                        {suggestionIds.length > 0
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
                      {exercise.options.length > 0 ? (
                        <div className="exercise-options-editor">
                          {exercise.options.map((option) => (
                            <label key={option.id}>
                              <span>{option.ordinal}</span>
                              <input
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
                          ))}
                        </div>
                      ) : null}
                      <div className="exercise-meta">
                        <span className="provenance-badge">Источник привязан</span>
                        <span>{interactionLabel(exercise.interactionKind)}</span>
                      </div>
                      <div className="answer-fields">
                        {exercise.answerFields.map((field, index) => (
                          <div className="answer-editor" key={field.id}>
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
                        ))}
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
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
      </div>
      {message ? (
        <p className="review-message" role="status">
          {message}
        </p>
      ) : null}
      <button
        className="review-save"
        type="button"
        disabled={pending}
        onClick={() => {
          void saveReview();
        }}
      >
        {pending ? "Сохраняем…" : "Подтвердить и сохранить ответы"}
      </button>
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
    wordBankGap: "Банк слов"
  }[kind];
}
