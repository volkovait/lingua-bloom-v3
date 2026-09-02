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
  test("extracts sequential items without punctuation and treats article ellipses as gaps", () => {
    const document = buildTextDocumentIr(
      "Справка об артиклях.\nУпражнение 2\nВставьте артикль, где необходимо.\n" +
        "1 This is ... cat. ... cat sleeps. 2 I see ... dog.",
      { id: "ir:articles", sourceDocumentId: "source:articles" }
    );

    const result = extractTextExercises(document, { documentIrId: "ir:articles" });
    const exercises = result.groups[0]?.exercises ?? [];

    expect(exercises.map((exercise) => exercise.itemOrdinal)).toEqual([1, 2]);
    expect(exercises.map((exercise) => exercise.answerFields.length)).toEqual([2, 1]);
    expect(exercises.map((exercise) => exercise.prompt)).toEqual([
      "This is ___ cat. ___ cat sleeps.",
      "I see ___ dog."
    ]);
    expect(
      exercises.flatMap((exercise) => exercise.answerFields.map((field) => field.markerKind))
    ).toEqual(["ellipsis", "ellipsis", "ellipsis"]);
  });

  test("keeps independently answerable items out of the group instruction", () => {
    const document = buildTextDocumentIr(
      "22A. Write questions with Do …? or Does …? " +
        "1 I like chocolate. How about you? (to ask) " +
        "2 I play tennis. How about you? (to ask) " +
        "3 You live near here. How about Lucy? (to ask)",
      { id: "ir:atomic-items", sourceDocumentId: "source:atomic-items" }
    );

    const group = extractTextExercises(document, {
      documentIrId: "ir:atomic-items"
    }).groups[0];

    expect(group?.instruction).toBe("22A. Write questions with Do …? or Does …?");
    expect(group?.exercises).toHaveLength(3);
    expect(group?.exercises.map((exercise) => exercise.prompt)).toEqual([
      "I like chocolate. How about you? (to ask)",
      "I play tennis. How about you? (to ask)",
      "You live near here. How about Lucy? (to ask)"
    ]);
    expect(group?.exercises.every((exercise) => !group.instruction.includes(exercise.prompt))).toBe(
      true
    );
  });

  test("routes non-empty unsupported text to typed layout review", () => {
    const document = buildTextDocumentIr("Unnumbered source material that needs classification.", {
      id: "ir:unknown-text",
      sourceDocumentId: "source:unknown-text"
    });

    const result = extractTextExercises(document, { documentIrId: "ir:unknown-text" });

    expect(result.groups).toEqual([]);
    expect(result.unknownCandidates).toHaveLength(1);
    expect(result.coverage).toMatchObject({
      detectedCandidateCount: 1,
      accountedCandidateCount: 0,
      status: "needsReview"
    });
  });
});
