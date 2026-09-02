import { describe, expect, test } from "vitest";

import {
  filterLessonLibrary,
  LessonLibraryPageSchema,
  normalizeLessonLibraryStatus,
  planLessonLibraryPage,
  toIlikeContainsPattern
} from "./library-filter";

const items = [
  { id: "published", title: "Present Simple", status: "published" as const },
  { id: "review", title: "Reading Practice", status: "awaiting_review" as const },
  { id: "ready", title: "Articles", status: "ready_to_publish" as const }
];

describe("lesson library filtering", () => {
  test("matches titles case-insensitively and trims the query", () => {
    expect(filterLessonLibrary(items, { query: "  READING ", status: "all" })).toEqual([items[1]]);
  });

  test("filters by exact lifecycle status", () => {
    expect(filterLessonLibrary(items, { query: "", status: "published" })).toEqual([items[0]]);
    expect(filterLessonLibrary(items, { query: "", status: "ready_to_publish" })).toEqual([
      items[2]
    ]);
  });

  test("treats unknown URL status as all", () => {
    expect(normalizeLessonLibraryStatus("unknown")).toBe("all");
    expect(normalizeLessonLibraryStatus("failed")).toBe("failed");
  });

  test("escapes PostgREST wildcard characters in literal title search", () => {
    expect(toIlikeContainsPattern("  100%_unit  ")).toBe("%100\\%\\_unit%");
  });

  test("pages through 49 mixed items without omissions at the published/draft boundary", () => {
    expect(planLessonLibraryPage(0, 30, 19)).toEqual({
      publishedOffset: 0,
      publishedLimit: 24,
      draftOffset: 0,
      draftLimit: 0,
      nextOffset: 24
    });
    expect(planLessonLibraryPage(24, 30, 19)).toEqual({
      publishedOffset: 24,
      publishedLimit: 6,
      draftOffset: 0,
      draftLimit: 18,
      nextOffset: 48
    });
    expect(planLessonLibraryPage(48, 30, 19)).toEqual({
      publishedOffset: 30,
      publishedLimit: 0,
      draftOffset: 18,
      draftLimit: 1,
      nextOffset: null
    });
  });

  test("requires the total number of matching lessons independently from page size", () => {
    expect(
      LessonLibraryPageSchema.parse({
        items: [],
        totalMatched: 49,
        nextCursor: "offset:24"
      }).totalMatched
    ).toBe(49);
  });
});
