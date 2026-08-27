import type { DocumentIR } from "@lingua-bloom/contracts";
import { buildTextDocumentIr } from "@lingua-bloom/document-ingestion";
import { describe, expect, test } from "vitest";

import { extractTextExercises } from "./bracket-gap-extractor";

describe("bracket gap text extraction", () => {
  test("keeps multiple fields in source order and reports a truncated final item", () => {
    const document = buildTextDocumentIr(
      "Exercise\nComplete the sentences.\n1. I (to be) here and (to work) today.\n2. We (to go)",
      { id: "ir:text", sourceDocumentId: "source:text" }
    );

    const result = extractTextExercises(document, { documentIrId: "ir:text" });
    const exercises = result.groups[0]?.exercises ?? [];

    expect(exercises.map((exercise) => exercise.itemOrdinal)).toEqual([1, 2]);
    expect(exercises.map((exercise) => exercise.answerFields.length)).toEqual([2, 1]);
    expect(exercises[0]?.answerFields.map((field) => field.sourceRefs[0]?.charStart)).toEqual(
      [...(exercises[0]?.answerFields ?? [])]
        .map((field) => field.sourceRefs[0]?.charStart)
        .sort((left, right) => (left ?? 0) - (right ?? 0))
    );
    expect(result.issues.some((issue) => issue.code === "SOURCE_TRUNCATED")).toBe(true);
  });

  test("does not treat non-sequential numbers as item boundaries", () => {
    const document: DocumentIR = buildTextDocumentIr(
      "Exercise 197\nDo the task.\n1. First (to be). 2. Second (to go).",
      { id: "ir:text", sourceDocumentId: "source:text" }
    );
    expect(
      extractTextExercises(document, { documentIrId: "ir:text" }).groups[0]?.exercises
    ).toHaveLength(2);
  });

  test("keeps dialogue ellipses as context in bracket-gap exercises", () => {
    const document = buildTextDocumentIr(
      "Exercise\nOpen the brackets.\n1. You (to wear) it? — Yes, I .... I (to wear) it yesterday.",
      { id: "ir:text", sourceDocumentId: "source:text" }
    );

    const exercise = extractTextExercises(document, {
      documentIrId: "ir:text"
    }).groups[0]?.exercises[0];

    expect(exercise?.prompt).toContain("Yes, I ....");
    expect(exercise?.answerFields).toHaveLength(2);
    expect(exercise?.answerFields.map((field) => field.sourceValue)).toEqual([
      "to wear",
      "to wear"
    ]);
  });
});
