import { describe, expect, test } from "vitest";
import { TeacherAttemptHistoryPageSchema } from "./teacher-attempt-history";

describe("teacher attempt history contracts", () => {
  test("rejects secret and ownership fields", () => {
    const item = {
      attemptId: "f62143d1-2dd1-4e2e-9f41-79a3b81fd422",
      lessonId: "0c6447d6-72bd-4728-91d1-d7a3847f3df9",
      lessonTitle: "Lesson",
      lessonVersion: 1,
      studentDisplayName: "Student",
      createdAt: "2026-09-02T10:00:00+00:00",
      correctCount: 1,
      totalCount: 2,
      resultStatus: "partial",
      delivery: { status: "sent", failureCategory: null }
    };
    expect(
      TeacherAttemptHistoryPageSchema.parse({
        schemaVersion: "1.0.0",
        items: [item],
        totalMatched: 1,
        nextCursor: null
      }).items
    ).toHaveLength(1);
    expect(() =>
      TeacherAttemptHistoryPageSchema.parse({
        schemaVersion: "1.0.0",
        items: [{ ...item, ownerId: "secret" }],
        totalMatched: 1,
        nextCursor: null
      })
    ).toThrow();
  });
});
