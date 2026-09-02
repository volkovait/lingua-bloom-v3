"use client";

import {
  STUDENT_ATTEMPT_SCHEMA_VERSION,
  StudentAttemptResultSchema,
  type StudentAttemptResult,
  type StudentLessonSpec
} from "@lingua-bloom/contracts";
import * as React from "react";

import { splitInlineChoicePrompt } from "../../src/lesson/inline-choice";

export function LessonRenderer({ lesson }: { readonly lesson: StudentLessonSpec }) {
  const [responses, setResponses] = React.useState<Record<string, string>>({});
  const [studentName, setStudentName] = React.useState("");
  const [result, setResult] = React.useState<StudentAttemptResult | null>(null);
  const [activeMatchingFieldId, setActiveMatchingFieldId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const fieldRefs = React.useRef(new Map<string, HTMLElement>());
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const content = [
    ...lesson.groups.map((group) => ({
      kind: "group" as const,
      sourceOrder: group.sourceOrder ?? group.ordinal * 1000,
      value: group
    })),
    ...(lesson.referenceBlocks ?? []).map((block) => ({
      kind: "reference" as const,
      sourceOrder: block.sourceOrder,
      value: block
    }))
  ].sort((left, right) => left.sourceOrder - right.sourceOrder);
  const fieldResults = new Map(result?.fields.map((field) => [field.fieldId, field]) ?? []);
  const exerciseResults = new Map(
    result?.exercises.map((exercise) => [exercise.exerciseId, exercise.status]) ?? []
  );

  React.useEffect(() => {
    if (!result) return;
    const firstError = result.fields.find((field) => field.status === "incorrect");
    const target = firstError ? fieldRefs.current.get(firstError.fieldId) : summaryRef.current;
    if (!target) return;
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
    });
  }, [result]);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentName.trim()) {
      setError("Укажите ваше имя.");
      return;
    }
    setSubmitting(true);
    setError("");
    const attemptId = crypto.randomUUID();
    const response = await fetch(`/api/lessons/${lesson.publicLessonId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: STUDENT_ATTEMPT_SCHEMA_VERSION,
        attemptId,
        lessonVersion: lesson.version,
        studentDisplayName: studentName.trim(),
        responses: lesson.groups.flatMap((group) =>
          group.exercises.flatMap((exercise) =>
            exercise.responseFields.map((field) => {
              const value = responses[field.id] ?? "";
              if (field.responseKind === "choice")
                return { fieldId: field.id, kind: "choice", optionId: value };
              if (field.responseKind === "orderedTokens")
                return {
                  fieldId: field.id,
                  kind: "orderedTokens",
                  tokenIds: orderedTokenValues(exercise.prompt, value)
                };
              return { fieldId: field.id, kind: "text", value };
            })
          )
        )
      })
    });
    const payload: unknown = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "message" in payload
          ? String(payload.message)
          : "Не удалось проверить ответы";
      setError(message);
      return;
    }
    const parsed = StudentAttemptResultSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Сервер вернул некорректный результат проверки");
      return;
    }
    setResult(parsed.data);
  }

  function update(fieldId: string, value: string) {
    if (result) return;
    setResponses((current) => ({ ...current, [fieldId]: value }));
  }

  function restart() {
    setResponses({});
    setResult(null);
    setError("");
  }

  return (
    <main className="student-page">
      <header className="student-hero">
        <p className="eyebrow">Lingua Bloom · версия {lesson.version}</p>
        <h1>{lesson.title}</h1>
        <p>Выполните задания и нажмите «Завершить и проверить».</p>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <section className="student-identity">
          <label>
            <span>Ваше имя</span>
            <input
              value={studentName}
              maxLength={120}
              readOnly={result != null}
              onChange={(event) => {
                setStudentName(event.target.value);
              }}
              required
            />
          </label>
        </section>
        {result ? (
          <div className="attempt-summary" ref={summaryRef} tabIndex={-1} role="status">
            <strong>
              {result.score.correct} из {result.score.total}
            </strong>
            <span>
              {result.score.correct === result.score.total
                ? "Все ответы правильные!"
                : "Проверьте отмеченные ошибки."}
            </span>
          </div>
        ) : null}
        {content.map((entry) =>
          entry.kind === "reference" ? (
            <aside className="student-reference-block" key={entry.value.id}>
              {entry.value.lines.map((line) => (
                <p key={line.id}>{line.rawText}</p>
              ))}
            </aside>
          ) : (
            <section
              className={`student-group${entry.value.completeness === "partial" ? " is-partial" : ""}`}
              key={entry.value.id}
            >
              <h2>
                {entry.value.ordinal}. {entry.value.instruction}
              </h2>
              {entry.value.completeness === "partial" ? (
                <p className="student-partial-notice">
                  Фрагмент задания: начало отсутствует в загруженном источнике.
                </p>
              ) : null}
              {(entry.value.sharedResources ?? []).map((resource) => (
                <aside
                  aria-label={resource.label ?? "Слова для заданий"}
                  className="shared-word-bank"
                  key={resource.id}
                >
                  {resource.label ? <strong>{resource.label}</strong> : null}
                  {resource.kind === "matchingBank" ? (
                    <div className="matching-bank" aria-label="Варианты для сопоставления">
                      {resource.entries.map((option) => {
                        const used = Object.values(responses).includes(option.id);
                        return (
                          <button
                            className="matching-token"
                            disabled={result != null || used}
                            draggable={result == null && !used}
                            key={option.id}
                            type="button"
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/lingua-bloom-option", option.id);
                            }}
                            onClick={() => {
                              if (activeMatchingFieldId) update(activeMatchingFieldId, option.id);
                            }}
                          >
                            {option.sourceLabel ? <b>{option.sourceLabel}</b> : null}
                            {option.value}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <ul>
                      {resource.entries.map((word) => (
                        <li key={word.id}>{word.value}</li>
                      ))}
                    </ul>
                  )}
                </aside>
              ))}
              {entry.value.exercises.map((exercise) => {
                const inlineField =
                  exercise.interactionKind === "singleChoice" &&
                  exercise.responseFields.length === 1 &&
                  exercise.responseFields[0]?.responseKind === "choice"
                    ? exercise.responseFields[0]
                    : null;
                const inlinePrompt = inlineField ? splitInlineChoicePrompt(exercise.prompt) : null;
                const exerciseStatus = exerciseResults.get(exercise.id);
                const matchingField =
                  exercise.interactionKind === "matching" && exercise.responseFields.length === 1
                    ? exercise.responseFields[0]
                    : null;
                const matchingResource = matchingField
                  ? (entry.value.sharedResources ?? []).find(
                      (resource) => resource.id === exercise.sharedResourceId
                    )
                  : null;
                const selectedMatch = matchingResource?.entries.find(
                  (option) => option.id === responses[matchingField?.id ?? ""]
                );
                return (
                  <article
                    className={`student-exercise${exerciseStatus ? ` is-${exerciseStatus}` : ""}`}
                    key={exercise.id}
                  >
                    <h3>
                      <span>{exercise.ordinal}</span>
                      {inlinePrompt && inlineField ? (
                        <>
                          {inlinePrompt.before}
                          <select
                            ref={(node) => {
                              if (node) fieldRefs.current.set(inlineField.id, node);
                            }}
                            className={`student-inline-choice${responses[inlineField.id] ? " has-value" : ""}${fieldClass(fieldResults.get(inlineField.id)?.status)}`}
                            aria-label={`Ответ на задание ${String(exercise.ordinal)}`}
                            aria-invalid={fieldResults.get(inlineField.id)?.status === "incorrect"}
                            value={responses[inlineField.id] ?? ""}
                            onChange={(event) => {
                              update(inlineField.id, event.target.value);
                            }}
                          >
                            <option value="">Выберите…</option>
                            {exercise.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.value}
                              </option>
                            ))}
                          </select>
                          {inlinePrompt.after}
                        </>
                      ) : (
                        exercise.prompt
                      )}
                    </h3>
                    {inlineField ? (
                      <FieldFeedback result={fieldResults.get(inlineField.id)} />
                    ) : null}
                    {matchingField ? (
                      <div
                        className={`matching-drop-zone${selectedMatch ? " has-value" : ""}${fieldClass(fieldResults.get(matchingField.id)?.status)}`}
                        ref={(node) => {
                          if (node) fieldRefs.current.set(matchingField.id, node);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ответ на задание ${String(exercise.ordinal)}. Перетащите вариант или выберите поле и нажмите вариант в банке.`}
                        aria-invalid={fieldResults.get(matchingField.id)?.status === "incorrect"}
                        onFocus={() => setActiveMatchingFieldId(matchingField.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const optionId = event.dataTransfer.getData("text/lingua-bloom-option");
                          if (optionId) update(matchingField.id, optionId);
                        }}
                      >
                        {selectedMatch ? (
                          <>
                            <span>{selectedMatch.value}</span>
                            {result == null ? (
                              <button type="button" onClick={() => update(matchingField.id, "")}>
                                Убрать
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span>Перетащите вариант сюда</span>
                        )}
                        <FieldFeedback result={fieldResults.get(matchingField.id)} />
                      </div>
                    ) : null}
                    {exercise.responseFields.map((field, index) =>
                      matchingField?.id === field.id ||
                      (inlineField?.id === field.id && inlinePrompt) ? null : field.responseKind ===
                        "choice" ? (
                        <fieldset
                          className={`student-response-field${fieldClass(fieldResults.get(field.id)?.status)}`}
                          key={field.id}
                          ref={(node) => {
                            if (node) fieldRefs.current.set(field.id, node);
                          }}
                          tabIndex={-1}
                          aria-invalid={fieldResults.get(field.id)?.status === "incorrect"}
                        >
                          <legend className="sr-only">Выберите ответ</legend>
                          {exercise.options.map((option) => (
                            <label className="student-choice" key={option.id}>
                              <input
                                type="radio"
                                name={field.id}
                                value={option.id}
                                checked={responses[field.id] === option.id}
                                onChange={() => {
                                  update(field.id, option.id);
                                }}
                              />
                              {option.value}
                            </label>
                          ))}
                          <FieldFeedback result={fieldResults.get(field.id)} />
                        </fieldset>
                      ) : field.responseKind === "orderedTokens" ? (
                        <WordOrderControl
                          key={field.id}
                          prompt={exercise.prompt}
                          value={responses[field.id] ?? ""}
                          readOnly={result != null}
                          result={fieldResults.get(field.id)}
                          onChange={(value) => update(field.id, value)}
                          register={(node) => {
                            if (node) fieldRefs.current.set(field.id, node);
                          }}
                        />
                      ) : (
                        <label
                          className={`student-answer${fieldClass(fieldResults.get(field.id)?.status)}`}
                          key={field.id}
                        >
                          <span>
                            Ваш ответ
                            {exercise.responseFields.length > 1 ? ` ${String(index + 1)}` : ""}
                          </span>
                          <input
                            ref={(node) => {
                              if (node) fieldRefs.current.set(field.id, node);
                            }}
                            value={responses[field.id] ?? ""}
                            readOnly={result != null}
                            aria-invalid={fieldResults.get(field.id)?.status === "incorrect"}
                            onChange={(event) => {
                              update(field.id, event.target.value);
                            }}
                          />
                          <FieldFeedback result={fieldResults.get(field.id)} />
                        </label>
                      )
                    )}
                  </article>
                );
              })}
            </section>
          )
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <button className="secondary-link" type="button" onClick={restart}>
            Пройти ещё раз
          </button>
        ) : (
          <button className="primary-link" disabled={submitting} type="submit">
            {submitting ? "Проверяем…" : "Завершить и проверить"}
          </button>
        )}
      </form>
    </main>
  );
}

function WordOrderControl({
  prompt,
  value,
  readOnly,
  result,
  onChange,
  register
}: {
  readonly prompt: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly result: StudentAttemptResult["fields"][number] | undefined;
  readonly onChange: (value: string) => void;
  readonly register: (node: HTMLElement | null) => void;
}) {
  const tokens = wordOrderTokens(prompt);
  const selected = decodeOrderedIds(value).filter((id) => Number(id) < tokens.length);
  const setSelected = (ids: readonly string[]) => onChange(JSON.stringify(ids));
  const add = (id: string) => {
    if (!readOnly && !selected.includes(id)) setSelected([...selected, id]);
  };
  const moveBefore = (moving: string, target: string) => {
    if (readOnly || moving === target) return;
    const without = selected.filter((id) => id !== moving);
    const targetIndex = without.indexOf(target);
    if (targetIndex < 0) return;
    setSelected([...without.slice(0, targetIndex), moving, ...without.slice(targetIndex)]);
  };
  return (
    <div
      className={`word-order-control${fieldClass(result?.status)}`}
      ref={register}
      tabIndex={-1}
      aria-invalid={result?.status === "incorrect"}
    >
      <div className="word-order-bank" aria-label="Слова для предложения">
        {tokens.map((token, index) => {
          const id = String(index);
          return (
            <button
              key={id}
              type="button"
              draggable={!readOnly && !selected.includes(id)}
              disabled={readOnly || selected.includes(id)}
              onClick={() => add(id)}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/lingua-bloom-order-token", id)
              }
            >
              {token}
            </button>
          );
        })}
      </div>
      <div
        className="word-order-drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => add(event.dataTransfer.getData("text/lingua-bloom-order-token"))}
      >
        {selected.length === 0 ? <span>Перетащите слова сюда</span> : null}
        {selected.map((id) => (
          <button
            key={id}
            type="button"
            draggable={!readOnly}
            disabled={readOnly}
            aria-label={`Убрать ${tokens[Number(id)] ?? "слово"}`}
            onClick={() => setSelected(selected.filter((candidate) => candidate !== id))}
            onDragStart={(event) => event.dataTransfer.setData("text/lingua-bloom-order-move", id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              moveBefore(event.dataTransfer.getData("text/lingua-bloom-order-move"), id);
            }}
          >
            {tokens[Number(id)]}
          </button>
        ))}
      </div>
      <FieldFeedback result={result} />
    </div>
  );
}

function wordOrderTokens(prompt: string) {
  return prompt
    .replace(/^\s*\d+[.)]?\s*/u, "")
    .split("/")
    .map((token) => token.trim())
    .filter(Boolean);
}

function decodeOrderedIds(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function orderedTokenValues(prompt: string, value: string) {
  const tokens = wordOrderTokens(prompt);
  return decodeOrderedIds(value).flatMap((id) => tokens[Number(id)] ?? []);
}

function fieldClass(status: "correct" | "incorrect" | undefined) {
  return status ? ` is-${status}` : "";
}

function FieldFeedback({
  result
}: {
  readonly result: StudentAttemptResult["fields"][number] | undefined;
}) {
  if (!result) return null;
  return (
    <span className="field-feedback" role={result.status === "incorrect" ? "alert" : "status"}>
      <strong>{result.status === "correct" ? "✓ Правильно" : "✕ Неправильно"}</strong>
      {result.acceptedDisplayValues ? (
        <small>Правильный ответ: {result.acceptedDisplayValues.join(" / ")}</small>
      ) : null}
    </span>
  );
}
