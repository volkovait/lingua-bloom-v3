import { describe, expect, test } from "vitest";

import {
  ensurePublicLessonId,
  resolveCurrentPublicVersion
} from "../../packages/domain/src/public-lesson-access";
import {
  createPublicLessonId,
  parsePublicLessonId
} from "../../packages/domain/src/public-lesson-id";

describe("public lesson access", () => {
  test("generates stable-format, non-enumerable capability samples", () => {
    const ids = Array.from({ length: 1_000 }, createPublicLessonId);
    expect(new Set(ids)).toHaveLength(ids.length);
    expect(ids.every((id) => parsePublicLessonId(id) === id)).toBe(true);
    expect(ids).not.toEqual([...ids].sort());
  });

  test("keeps the public ID stable when v2 is published", () => {
    const v1Id = createPublicLessonId();
    expect(ensurePublicLessonId(v1Id)).toBe(v1Id);
  });

  test("keeps an assigned public ID indefinitely and has no lifecycle mutation", () => {
    const publicLessonId = createPublicLessonId();
    for (let version = 1; version <= 100; version += 1) {
      expect(ensurePublicLessonId(publicLessonId)).toBe(publicLessonId);
    }
  });

  test("returns only the current published version and hides unknown/unpublished lessons", () => {
    const publicLessonId = createPublicLessonId();
    const versions = [
      { id: "v1", studentSpec: { version: 1 } },
      { id: "v2", studentSpec: { version: 2 } }
    ];
    expect(
      resolveCurrentPublicVersion({ publicLessonId, currentPublishedVersionId: "v2" }, versions)
    ).toEqual({ version: 2 });
    expect(resolveCurrentPublicVersion(null, versions)).toBeNull();
    expect(
      resolveCurrentPublicVersion({ publicLessonId, currentPublishedVersionId: null }, versions)
    ).toBeNull();
  });
});
