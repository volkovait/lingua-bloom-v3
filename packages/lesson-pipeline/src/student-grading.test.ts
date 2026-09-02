import type { LessonSpec } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { AttemptValidationError, gradeStudentAttempt } from "./student-grading";

describe("deterministic student grading", () => {
  test("grades matching by stable shared-entry ID", () => {
    const base = lesson();
    const evidence = base.groups[0]!.provenance;
    const matching: LessonSpec = {
      ...base,
      schemaVersion: "1.2.0",
      groups: [
        {
          ...base.groups[0]!,
          sharedResources: [
            {
              id: "matching-bank",
              ordinal: 1,
              kind: "matchingBank",
              entries: [
                { id: "entry-a", ordinal: 1, sourceLabel: "A", value: "one", provenance: evidence },
                { id: "entry-b", ordinal: 2, sourceLabel: "B", value: "two", provenance: evidence }
              ],
              usagePolicy: "useOnce",
              provenance: evidence
            }
          ],
          exercises: [
            {
              id: "matching-exercise",
              ordinal: 1,
              interactionKind: "matching",
              prompt: "1",
              sharedResourceId: "matching-bank",
              provenance: evidence,
              options: [],
              answerFields: [
                {
                  id: "matching-answer",
                  acceptedValues: ["entry-b"],
                  provenance: "sourceKey",
                  reviewStatus: "verified",
                  evidence
                }
              ]
            }
          ]
        }
      ]
    };
    const result = gradeStudentAttempt(matching, {
      schemaVersion: "1.0.0",
      attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
      lessonVersion: 2,
      studentDisplayName: "Student",
      responses: [{ fieldId: "matching-answer", kind: "choice", optionId: "entry-b" }]
    });
    expect(result.score).toEqual({ correct: 1, total: 1 });
  });

  test("rejects reusing one use-once matching entry", () => {
    const base = lesson();
    const evidence = base.groups[0]!.provenance;
    const exercise = (
      id: string,
      ordinal: number,
      answerId: string
    ): LessonSpec["groups"][number]["exercises"][number] => ({
      id,
      ordinal,
      interactionKind: "matching",
      prompt: String(ordinal),
      sharedResourceId: "matching-bank",
      provenance: evidence,
      options: [],
      answerFields: [
        {
          id: answerId,
          acceptedValues: [ordinal === 1 ? "entry-a" : "entry-b"],
          provenance: "sourceKey",
          reviewStatus: "verified",
          evidence
        }
      ]
    });
    const matching: LessonSpec = {
      ...base,
      schemaVersion: "1.2.0",
      groups: [
        {
          ...base.groups[0]!,
          sharedResources: [
            {
              id: "matching-bank",
              ordinal: 1,
              kind: "matchingBank",
              entries: [
                { id: "entry-a", ordinal: 1, value: "one", provenance: evidence },
                { id: "entry-b", ordinal: 2, value: "two", provenance: evidence }
              ],
              usagePolicy: "useOnce",
              provenance: evidence
            }
          ],
          exercises: [exercise("matching-1", 1, "answer-1"), exercise("matching-2", 2, "answer-2")]
        }
      ]
    };
    expect(() =>
      gradeStudentAttempt(matching, {
        schemaVersion: "1.0.0",
        attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
        lessonVersion: 2,
        studentDisplayName: "Student",
        responses: [
          { fieldId: "answer-1", kind: "choice", optionId: "entry-a" },
          { fieldId: "answer-2", kind: "choice", optionId: "entry-a" }
        ]
      })
    ).toThrowError(AttemptValidationError);
  });

  test("grades choice/text fields, reveals only incorrect answers and derives partial state", () => {
    const result = gradeStudentAttempt(lesson(), {
      schemaVersion: "1.0.0",
      attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
      lessonVersion: 2,
      studentDisplayName: "Student",
      responses: [
        { fieldId: "choice-answer", kind: "choice", optionId: "option-b" },
        { fieldId: "text-answer-1", kind: "text", value: "DO YOU WEAR?" },
        { fieldId: "text-answer-2", kind: "text", value: "wrong" }
      ]
    });

    expect(result.score).toEqual({ correct: 2, total: 3 });
    expect(result.fields[0]).toMatchObject({ status: "correct" });
    expect(result.fields[0]).not.toHaveProperty("acceptedDisplayValues");
    expect(result.fields[2]).toMatchObject({
      status: "incorrect",
      acceptedDisplayValues: ["wore"]
    });
    expect(result.exercises).toContainEqual({ exerciseId: "text-exercise", status: "partial" });
  });

  test("counts a missing response as incorrect and rejects unknown fields", () => {
    const base = {
      schemaVersion: "1.0.0" as const,
      attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
      lessonVersion: 2,
      studentDisplayName: "Student"
    };
    expect(gradeStudentAttempt(lesson(), { ...base, responses: [] }).score).toEqual({
      correct: 0,
      total: 3
    });
    expect(() =>
      gradeStudentAttempt(lesson(), {
        ...base,
        responses: [{ fieldId: "foreign", kind: "text", value: "x" }]
      })
    ).toThrowError(AttemptValidationError);
  });
});

function lesson(): LessonSpec {
  const ref = { sourceDocumentId: "source", documentIrId: "ir", blockId: "block" };
  const evidence = { sourceRefs: [ref] };
  return {
    schemaVersion: "1.1.0",
    lessonId: "lesson",
    version: 2,
    title: "Test",
    sourceDocumentId: "source",
    documentIrId: "ir",
    groups: [
      {
        id: "group",
        ordinal: 1,
        instruction: "Complete",
        provenance: evidence,
        sharedResources: [],
        exercises: [
          {
            id: "choice-exercise",
            ordinal: 1,
            interactionKind: "singleChoice",
            prompt: "Choose",
            provenance: evidence,
            options: [
              { id: "option-a", ordinal: 1, value: "A", provenance: evidence },
              { id: "option-b", ordinal: 2, value: "B", provenance: evidence }
            ],
            answerFields: [
              {
                id: "choice-answer",
                acceptedValues: ["B"],
                provenance: "sourceKey",
                reviewStatus: "verified",
                evidence
              }
            ]
          },
          {
            id: "text-exercise",
            ordinal: 2,
            interactionKind: "bracketGap",
            prompt: "Fill",
            provenance: evidence,
            options: [],
            answerFields: [
              {
                id: "text-answer-1",
                acceptedValues: ["Do you wear"],
                provenance: "sourceKey",
                reviewStatus: "verified",
                evidence
              },
              {
                id: "text-answer-2",
                acceptedValues: ["wore"],
                provenance: "sourceKey",
                reviewStatus: "verified",
                evidence
              }
            ]
          }
        ]
      }
    ],
    validation: {
      status: "passed",
      blockingIssueCount: 0,
      unsupportedAdditionCount: 0,
      unresolvedAnswerCount: 0
    }
  };
}
