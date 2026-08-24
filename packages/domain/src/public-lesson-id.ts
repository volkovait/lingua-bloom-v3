import { randomBytes } from "node:crypto";

export const PUBLIC_LESSON_ID_BYTES = 16;
export const PUBLIC_LESSON_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type PublicLessonId = string & { readonly __brand: "PublicLessonId" };

export function createPublicLessonId(): PublicLessonId {
  return randomBytes(PUBLIC_LESSON_ID_BYTES).toString("base64url") as PublicLessonId;
}

export function parsePublicLessonId(value: string): PublicLessonId | null {
  return PUBLIC_LESSON_ID_PATTERN.test(value) ? (value as PublicLessonId) : null;
}
