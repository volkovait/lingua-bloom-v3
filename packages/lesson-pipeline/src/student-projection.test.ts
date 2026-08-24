import type { LessonSpec } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { projectStudentLesson } from "./student-projection";

describe("student-safe lesson projection", () => {
  test("contains no accepted answers, provenance, decisions or internal lesson id", () => {
    const lesson = fixtureLesson();
    const student = projectStudentLesson(lesson, "abcdefghijklmnopqrstuv");
    const serialized = JSON.stringify(student);
    expect(serialized).not.toContain("acceptedValues");
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("reviewDecisionIds");
    expect(serialized).not.toContain(lesson.lessonId);
    expect(student.groups[0]?.exercises[0]?.responseFields).toEqual([
      { id: "answer-1", responseKind: "choice" }
    ]);
  });
});

function fixtureLesson(): LessonSpec {
  return {
    schemaVersion: "1.0.0",
    lessonId: "internal-lesson",
    version: 1,
    title: "Lesson",
    sourceDocumentId: "source-1",
    documentIrId: "ir-1",
    groups: [
      {
        id: "group-1",
        ordinal: 1,
        instruction: "Choose",
        provenance: { sourceRefs: [ref()] },
        exercises: [
          {
            id: "exercise-1",
            ordinal: 1,
            interactionKind: "singleChoice",
            prompt: "Pick one",
            provenance: { sourceRefs: [ref()] },
            options: [
              { id: "a", ordinal: 1, value: "A", provenance: { sourceRefs: [ref()] } },
              { id: "b", ordinal: 2, value: "B", provenance: { sourceRefs: [ref()] } }
            ],
            answerFields: [
              {
                id: "answer-1",
                acceptedValues: ["a"],
                provenance: "teacherSupplied",
                reviewStatus: "verified",
                evidence: { reviewDecisionIds: ["decision-1"] }
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

function ref() {
  return { sourceDocumentId: "source-1", documentIrId: "ir-1", blockId: "block-1" };
}
