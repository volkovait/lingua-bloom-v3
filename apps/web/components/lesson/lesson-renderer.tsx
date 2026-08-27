"use client";

import type { StudentLessonSpec } from "@lingua-bloom/contracts";
import * as React from "react";

export function LessonRenderer({ lesson }: { readonly lesson: StudentLessonSpec }) {
  const [responses, setResponses] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);
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

  return (
    <main className="student-page">
      <header className="student-hero">
        <p className="eyebrow">Lingua Bloom · версия {lesson.version}</p>
        <h1>{lesson.title}</h1>
        <p>Выполните задания в удобном темпе. Ответы сохраняются только в этой вкладке.</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
        }}
      >
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
                  <ul>
                    {resource.entries.map((word) => (
                      <li key={word.id}>{word.value}</li>
                    ))}
                  </ul>
                </aside>
              ))}
              {entry.value.exercises.map((exercise) => (
                <article className="student-exercise" key={exercise.id}>
                  <h3>
                    <span>{exercise.ordinal}</span>
                    {exercise.prompt}
                  </h3>
                  {exercise.responseFields.map((field, index) =>
                    field.responseKind === "choice" ? (
                      <fieldset key={field.id}>
                        <legend className="sr-only">Выберите ответ</legend>
                        {exercise.options.map((option) => (
                          <label className="student-choice" key={option.id}>
                            <input
                              type="radio"
                              name={field.id}
                              value={option.id}
                              checked={responses[field.id] === option.id}
                              onChange={() => {
                                setResponses((current) => ({ ...current, [field.id]: option.id }));
                              }}
                            />
                            {option.value}
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <label className="student-answer" key={field.id}>
                        <span>
                          Ваш ответ
                          {exercise.responseFields.length > 1 ? ` ${String(index + 1)}` : ""}
                        </span>
                        <input
                          value={responses[field.id] ?? ""}
                          onChange={(event) => {
                            setResponses((current) => ({
                              ...current,
                              [field.id]: event.target.value
                            }));
                          }}
                        />
                      </label>
                    )
                  )}
                </article>
              ))}
            </section>
          )
        )}
        <button className="primary-link" type="submit">
          Завершить урок
        </button>
        {submitted ? (
          <p className="student-notice" role="status">
            Ответы заполнены. Проверка результатов будет добавлена отдельным student-attempt flow.
          </p>
        ) : null}
      </form>
    </main>
  );
}
