import type { DocumentIR, ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import {
  createPublishedLessonSpec,
  getPublicationBlockReasons,
  PublicationBlockedError
} from "./publish-version";

describe("publication gate", () => {
  test("publishes only a verified draft with valid source lineage", () => {
    const lesson = createPublishedLessonSpec({
      lessonId: "lesson-1",
      version: 1,
      draft: fixtureDraft(),
      document: fixtureDocument(),
      openBlockingIssueCount: 0,
      unsupportedAdditionCount: 0
    });
    expect(lesson.validation.status).toBe("passed");
    expect(lesson.groups[0]?.exercises[0]?.answerFields[0]?.reviewStatus).toBe("verified");
  });

  test("returns the same concrete reasons used to decide workflow readiness", () => {
    const draft = fixtureDraft();
    const answer = firstExercise(draft).answerFields[0];
    if (!answer) throw new Error("Fixture answer is missing");
    firstExercise(draft).answerFields[0] = {
      ...answer,
      acceptedValues: [],
      provenance: "modelInferred",
      reviewStatus: "needsReview"
    };

    expect(
      getPublicationBlockReasons({
        draft,
        document: fixtureDocument(),
        openBlockingIssueCount: 1,
        unsupportedAdditionCount: 1
      })
    ).toEqual([
      "blocking issues remain open",
      "unsupported additions remain",
      "answers remain unverified"
    ]);
  });

  test("rejects draft-only answer states", () => {
    const draft = fixtureDraft();
    const exercise = firstExercise(draft);
    const answer = exercise.answerFields[0];
    if (!answer) throw new Error("Fixture answer is missing");
    exercise.answerFields[0] = {
      ...answer,
      acceptedValues: [],
      provenance: "modelInferred",
      reviewStatus: "needsReview"
    };
    expect(() =>
      createPublishedLessonSpec({
        lessonId: "lesson-1",
        version: 1,
        draft,
        document: fixtureDocument(),
        openBlockingIssueCount: 0,
        unsupportedAdditionCount: 0
      })
    ).toThrowError(PublicationBlockedError);
  });

  test("rejects a SourceRef outside the persisted DocumentIR", () => {
    const draft = fixtureDraft();
    firstExercise(draft).provenance = {
      sourceRefs: [{ ...ref(), blockId: "missing-block" }]
    };
    try {
      createPublishedLessonSpec({
        lessonId: "lesson-1",
        version: 1,
        draft,
        document: fixtureDocument(),
        openBlockingIssueCount: 0,
        unsupportedAdditionCount: 0
      });
      throw new Error("Expected publication to be blocked");
    } catch (error) {
      expect(error).toBeInstanceOf(PublicationBlockedError);
      expect((error as PublicationBlockedError).reasons).toContain(
        "invalid SourceRef missing-block"
      );
    }
  });
});

function fixtureDraft(): ReviewDraft {
  return {
    schemaVersion: "1.0.0",
    title: "Lesson",
    sourceDocumentId: "source-1",
    documentIrId: "ir-1",
    coverage: {
      entries: [],
      detectedCandidateCount: 1,
      accountedCandidateCount: 1,
      unsupportedAdditionCount: 0,
      status: "passed"
    },
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
                provenance: "sourceKey",
                reviewStatus: "verified",
                evidence: { sourceRefs: [ref()] }
              }
            ]
          }
        ]
      }
    ]
  };
}

function fixtureDocument(): DocumentIR {
  return {
    schemaVersion: "1.0.0",
    id: "ir-1",
    sourceDocumentId: "source-1",
    pages: [{ index: 0, width: 100, height: 100 }],
    blocks: [{ id: "block-1", pageIndex: 0, kind: "text", rawText: "Pick one A B", order: 0 }],
    warnings: []
  };
}

function ref() {
  return { sourceDocumentId: "source-1", documentIrId: "ir-1", blockId: "block-1" };
}

function firstExercise(draft: ReviewDraft) {
  const exercise = draft.groups[0]?.exercises[0];
  if (!exercise) throw new Error("Fixture exercise is missing");
  return exercise;
}
