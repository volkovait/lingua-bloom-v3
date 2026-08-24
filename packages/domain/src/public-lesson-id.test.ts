import { describe, expect, test } from "vitest";

import {
  createPublicLessonId,
  parsePublicLessonId,
  PUBLIC_LESSON_ID_BYTES,
  PUBLIC_LESSON_ID_PATTERN
} from "./public-lesson-id";

describe("public lesson capability IDs", () => {
  test("use 128 bits of CSPRNG entropy and a URL-safe representation", () => {
    expect(PUBLIC_LESSON_ID_BYTES * 8).toBeGreaterThanOrEqual(128);
    expect(createPublicLessonId()).toMatch(PUBLIC_LESSON_ID_PATTERN);
  });

  test("do not collide in a representative sample", () => {
    const ids = Array.from({ length: 10_000 }, createPublicLessonId);
    expect(new Set(ids)).toHaveLength(ids.length);
  });

  test("rejects internal and malformed IDs", () => {
    expect(parsePublicLessonId("42")).toBeNull();
    expect(parsePublicLessonId("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });
});
