import { z } from "zod";

export const LESSON_LIBRARY_PAGE_SIZE = 24;

export const LESSON_LIBRARY_STATUSES = [
  "all",
  "published",
  "accepted",
  "processing",
  "awaiting_review",
  "ready_to_publish",
  "failed"
] as const;

export type LessonLibraryStatus = (typeof LESSON_LIBRARY_STATUSES)[number];

const PublishedLessonCardSchema = z
  .object({
    kind: z.literal("published"),
    id: z.string(),
    title: z.string(),
    status: z.literal("published"),
    publicLessonId: z.string(),
    versionCount: z.number().int().positive(),
    latestVersion: z.number().int().positive(),
    updatedAt: z.iso.datetime({ offset: true })
  })
  .strict();

const DraftLessonCardSchema = z
  .object({
    kind: z.literal("draft"),
    id: z.string(),
    title: z.string(),
    status: z.enum(["accepted", "processing", "awaiting_review", "ready_to_publish", "failed"]),
    updatedAt: z.iso.datetime({ offset: true })
  })
  .strict();

export const LessonLibraryCardSchema = z.discriminatedUnion("kind", [
  PublishedLessonCardSchema,
  DraftLessonCardSchema
]);

export const LessonLibraryPageSchema = z
  .object({
    items: z.array(LessonLibraryCardSchema).max(LESSON_LIBRARY_PAGE_SIZE),
    totalMatched: z.number().int().nonnegative(),
    nextCursor: z.string().min(1).nullable()
  })
  .strict();

export type LessonLibraryCard = z.infer<typeof LessonLibraryCardSchema>;
export type LessonLibraryPage = z.infer<typeof LessonLibraryPageSchema>;

export interface LessonLibraryItem {
  readonly title: string;
  readonly status: Exclude<LessonLibraryStatus, "all">;
}

export function normalizeLessonLibraryStatus(value: string | undefined): LessonLibraryStatus {
  return LESSON_LIBRARY_STATUSES.includes(value as LessonLibraryStatus)
    ? (value as LessonLibraryStatus)
    : "all";
}

export function filterLessonLibrary<T extends LessonLibraryItem>(
  items: readonly T[],
  input: { readonly query: string; readonly status: LessonLibraryStatus }
) {
  const query = input.query.trim().toLocaleLowerCase("ru-RU");
  return items.filter(
    (item) =>
      (input.status === "all" || item.status === input.status) &&
      (!query || item.title.toLocaleLowerCase("ru-RU").includes(query))
  );
}

export function toIlikeContainsPattern(query: string) {
  return `%${query.trim().replace(/[\\%_]/gu, "\\$&")}%`;
}

export interface LessonLibraryPagePlan {
  readonly publishedOffset: number;
  readonly publishedLimit: number;
  readonly draftOffset: number;
  readonly draftLimit: number;
  readonly nextOffset: number | null;
}

export function planLessonLibraryPage(
  offset: number,
  publishedCount: number,
  draftCount: number,
  pageSize = LESSON_LIBRARY_PAGE_SIZE
): LessonLibraryPagePlan {
  const safeOffset = Math.max(0, offset);
  const publishedOffset = Math.min(safeOffset, publishedCount);
  const publishedLimit = Math.min(pageSize, Math.max(0, publishedCount - publishedOffset));
  const draftOffset = Math.min(draftCount, Math.max(0, safeOffset - publishedCount));
  const draftLimit = Math.min(pageSize - publishedLimit, Math.max(0, draftCount - draftOffset));
  const loadedCount = publishedLimit + draftLimit;
  const candidateNextOffset = safeOffset + loadedCount;

  return {
    publishedOffset,
    publishedLimit,
    draftOffset,
    draftLimit,
    nextOffset:
      loadedCount > 0 && candidateNextOffset < publishedCount + draftCount
        ? candidateNextOffset
        : null
  };
}
