import { describe, expect, test } from "vitest";

import { StudentAttemptResultSchema, StudentAttemptSubmissionSchema } from "./student-attempt";

describe("student attempt contracts", () => {
  test("rejects client-provided score and duplicate response fields", () => {
    const base = {
      schemaVersion: "1.0.0",
      attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
      lessonVersion: 1,
      studentDisplayName: "Student",
      responses: [
        { fieldId: "f1", kind: "text", value: "a" },
        { fieldId: "f1", kind: "text", value: "b" }
      ]
    };
    expect(StudentAttemptSubmissionSchema.safeParse(base).success).toBe(false);
    expect(
      StudentAttemptSubmissionSchema.safeParse({ ...base, responses: [], score: 10 }).success
    ).toBe(false);
  });

  test("never permits accepted values on a correct field", () => {
    expect(
      StudentAttemptResultSchema.safeParse({
        schemaVersion: "1.0.0",
        attemptId: "b3de0e9c-70dc-4885-82ed-f17b00cb64af",
        lessonVersion: 1,
        graderVersion: "1.0.0",
        score: { correct: 1, total: 1 },
        fields: [
          {
            fieldId: "f1",
            exerciseId: "e1",
            status: "correct",
            acceptedDisplayValues: ["secret"]
          }
        ],
        exercises: [{ exerciseId: "e1", status: "correct" }],
        delivery: { status: "pending" }
      }).success
    ).toBe(false);
  });
});
