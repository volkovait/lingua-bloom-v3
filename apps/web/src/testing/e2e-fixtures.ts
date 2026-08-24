import "server-only";

import type { StudentLessonSpec } from "@lingua-bloom/contracts";

export const E2E_REVIEW_RUN_ID = "run-e2e-review";
export const E2E_PUBLISH_RUN_ID = "run-e2e-publish";
export const E2E_LESSON_ID = "lesson-e2e-versioned";
export const E2E_PUBLIC_LESSON_ID = "e2e_public_lesson_0001";

export function isE2EFixtureMode() {
  return process.env.NODE_ENV !== "production" && process.env.E2E_FIXTURE_MODE === "1";
}

export function getE2EStudentLesson(publicLessonId: string): StudentLessonSpec | null {
  if (!isE2EFixtureMode() || publicLessonId !== E2E_PUBLIC_LESSON_ID) return null;
  return {
    schemaVersion: "1.0.0",
    publicLessonId: E2E_PUBLIC_LESSON_ID,
    version: 2,
    title: "English practice · version 2",
    groups: [
      {
        id: "group-e2e-1",
        ordinal: 1,
        instruction: "Complete the sentence",
        exercises: [
          {
            id: "exercise-e2e-1",
            ordinal: 1,
            interactionKind: "bracketGap",
            prompt: "She ___ to school every day.",
            options: [],
            responseFields: [{ id: "response-e2e-1", responseKind: "text" }]
          }
        ]
      }
    ]
  };
}
