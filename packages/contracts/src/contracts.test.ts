import fixture from "./fixtures/lesson-spec.v1.json";
import { describe, expect, test } from "vitest";

import { DraftAnswerRecordSchema, LessonSpecSchema } from "./lesson-spec";
import { StudentLessonSpecSchema } from "./student-lesson-spec";

const clone = <T>(value: T): T => structuredClone(value);

describe("published LessonSpec invariants", () => {
  test("normalizes legacy word-bank options to a v1.1 shared resource", () => {
    const legacy = clone(fixture);
    const group = legacy.groups[0];
    const exercise = group?.exercises[0];
    if (!group || !exercise) throw new Error("Invalid test fixture");
    exercise.interactionKind = "wordBankGap";
    const firstOption = exercise.options[0];
    const secondOption = exercise.options[1];
    if (!firstOption || !secondOption) throw new Error("Invalid word-bank options");
    const secondExercise = clone(exercise);
    secondExercise.id = "exercise-2";
    secondExercise.ordinal = 2;
    secondExercise.options = [
      { ...clone(secondOption), id: "o2-duplicate", ordinal: 1 },
      { ...clone(firstOption), id: "o3", ordinal: 2, value: "C" }
    ];
    group.exercises.push(secondExercise);
    const parsed = LessonSpecSchema.parse(legacy);
    expect(parsed.schemaVersion).toBe("1.1.0");
    expect(parsed.groups[0]?.sharedResources?.[0]?.entries.map((entry) => entry.value)).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(parsed.groups[0]?.sharedResources?.[0]?.entries.map((entry) => entry.ordinal)).toEqual([
      1, 2, 3
    ]);
    expect(parsed.groups[0]?.exercises[0]?.options).toEqual([]);
    expect(
      parsed.groups[0]?.exercises.every(
        (item) =>
          item.options.length === 0 &&
          item.sharedResourceId === parsed.groups[0]?.sharedResources?.[0]?.id
      )
    ).toBe(true);
  });

  test("requires v1.1 word-bank gaps to reference one group resource without local options", () => {
    const legacy = clone(fixture);
    const group = legacy.groups[0];
    const exercise = group?.exercises[0];
    if (!group || !exercise) throw new Error("Invalid test fixture");
    exercise.interactionKind = "wordBankGap";
    const normalized = LessonSpecSchema.parse(legacy);
    expect(LessonSpecSchema.safeParse(normalized).success).toBe(true);
    expect(
      LessonSpecSchema.safeParse({
        ...normalized,
        groups: normalized.groups.map((candidate) => ({
          ...candidate,
          exercises: candidate.exercises.map((item) =>
            item.interactionKind === "wordBankGap"
              ? { ...item, options: candidate.sharedResources?.[0]?.entries ?? [] }
              : item
          )
        }))
      }).success
    ).toBe(false);
  });

  test("rejects non-zero validation counters", () => {
    const lesson = clone(fixture);
    lesson.validation.blockingIssueCount = 1;
    expect(LessonSpecSchema.safeParse(lesson).success).toBe(false);
  });

  test("rejects cross-document source references", () => {
    const lesson = clone(fixture);
    const ref = lesson.groups.at(0)?.provenance.sourceRefs.at(0);
    if (!ref) throw new Error("Invalid test fixture");
    ref.sourceDocumentId = "other-source";
    expect(LessonSpecSchema.safeParse(lesson).success).toBe(false);
  });

  test("rejects unverified or inferred published answers", () => {
    const lesson = clone(fixture);
    const group = lesson.groups.at(0);
    const exercise = group?.exercises.at(0);
    const answer = exercise?.answerFields.at(0);
    if (!group || !exercise || !answer) throw new Error("Invalid test fixture");
    const invalidLesson = {
      ...lesson,
      groups: [
        {
          ...group,
          exercises: [
            {
              ...exercise,
              answerFields: [
                { ...answer, reviewStatus: "needsReview", provenance: "modelInferred" }
              ]
            }
          ]
        }
      ]
    };
    expect(LessonSpecSchema.safeParse(invalidLesson).success).toBe(false);
  });

  test("rejects empty verified answers and options without provenance", () => {
    const emptyAnswerLesson = clone(fixture);
    const emptyAnswer = emptyAnswerLesson.groups.at(0)?.exercises.at(0)?.answerFields.at(0);
    if (!emptyAnswer) throw new Error("Invalid test fixture");
    emptyAnswer.acceptedValues.length = 0;
    expect(LessonSpecSchema.safeParse(emptyAnswerLesson).success).toBe(false);

    const missingOptionProvenanceLesson = clone(fixture);
    const option = missingOptionProvenanceLesson.groups.at(0)?.exercises.at(0)?.options.at(0);
    if (!option) throw new Error("Invalid test fixture");
    Reflect.deleteProperty(option, "provenance");
    expect(LessonSpecSchema.safeParse(missingOptionProvenanceLesson).success).toBe(false);
  });

  test("requires an explicit missing boundary for partial groups", () => {
    const lesson = clone(fixture);
    const group = lesson.groups.at(0);
    if (!group) throw new Error("Invalid test fixture");
    expect(
      LessonSpecSchema.safeParse({
        ...lesson,
        schemaVersion: "1.1.0",
        groups: [{ ...group, completeness: "partial" }]
      }).success
    ).toBe(false);
    expect(
      LessonSpecSchema.safeParse({
        ...lesson,
        schemaVersion: "1.1.0",
        groups: [
          { ...group, sharedResources: [], completeness: "partial", missingBoundary: "start" }
        ]
      }).success
    ).toBe(true);
  });

  test("draft inferred answers remain reviewable", () => {
    expect(
      DraftAnswerRecordSchema.parse({
        id: "a1",
        acceptedValues: [],
        provenance: "modelInferred",
        reviewStatus: "needsReview",
        evidence: { reviewDecisionIds: ["decision-1"] }
      }).reviewStatus
    ).toBe("needsReview");
  });
});

describe("student-safe contract", () => {
  test("rejects answer-bearing fields", () => {
    expect(
      StudentLessonSpecSchema.safeParse({
        schemaVersion: "1.0.0",
        publicLessonId: "A".repeat(22),
        version: 1,
        title: "Safe",
        groups: [],
        acceptedValues: ["secret"]
      }).success
    ).toBe(false);
  });
});
