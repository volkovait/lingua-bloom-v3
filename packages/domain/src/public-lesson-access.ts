import { createPublicLessonId, type PublicLessonId } from "./public-lesson-id";

export interface PublicLessonPointer {
  readonly publicLessonId: PublicLessonId;
  readonly currentPublishedVersionId: string | null;
}

export interface PublishedStudentVersion<T> {
  readonly id: string;
  readonly studentSpec: T;
}

export function ensurePublicLessonId(existing: PublicLessonId | null): PublicLessonId {
  return existing ?? createPublicLessonId();
}

export function resolveCurrentPublicVersion<T>(
  lesson: PublicLessonPointer | null,
  versions: readonly PublishedStudentVersion<T>[]
): T | null {
  if (!lesson?.currentPublishedVersionId) return null;
  return (
    versions.find((version) => version.id === lesson.currentPublishedVersionId)?.studentSpec ?? null
  );
}
