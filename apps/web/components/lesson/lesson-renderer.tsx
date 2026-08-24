"use client";

import type { StudentLessonSpec } from "@lingua-bloom/contracts";
import * as React from "react";

export function LessonRenderer({ lesson }: { readonly lesson: StudentLessonSpec }) {
  const [responses, setResponses] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);
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
        {lesson.groups.map((group) => (
          <section className="student-group" key={group.id}>
            <h2>
              {group.ordinal}. {group.instruction}
            </h2>
            {group.exercises.map((exercise) => (
              <article className="student-exercise" key={exercise.id}>
                <h3>
                  <span>{exercise.ordinal}</span>
                  {exercise.prompt}
                </h3>
                {exercise.responseFields.map((field) =>
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
                      <span>Ваш ответ</span>
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
        ))}
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
