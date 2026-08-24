import fixture from "./fixtures/lesson-spec.v1.json";
import { describe, expect, test } from "vitest";

import { DraftAnswerRecordSchema, LessonSpecSchema } from "./lesson-spec";
import { StudentLessonSpecSchema } from "./student-lesson-spec";

const clone = <T>(value: T): T => structuredClone(value);

describe("published LessonSpec invariants", () => {
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
