import type { DocumentIR, ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import {
  createPublishedLessonSpec,
  getPublicationBlockReasons,
  PublicationBlockedError,
  type PublicationReadinessInput
} from "./publish-version";

describe("canonical publish readiness regression matrix", () => {
  const readinessCases: readonly [string, PublicationReadinessInput, readonly string[]][] = [
    ["ready", readyInput(), []],
    ["blocking issue", readyInput({ openBlockingIssueCount: 1 }), ["blocking issues remain open"]],
    [
      "unsupported addition",
      readyInput({ unsupportedAdditionCount: 1 }),
      ["unsupported additions remain"]
    ],
    ["unverified answer", unverifiedAnswerInput(), ["answers remain unverified"]],
    ["cross-document lineage", crossDocumentInput(), ["invalid SourceRef block-1"]],
    ["missing block", missingBlockInput(), ["invalid SourceRef missing-block"]],
    ["out-of-range ref", outOfRangeInput(), ["SourceRef range exceeds block block-1"]]
  ];

  test.each(readinessCases)("returns exhaustive reasons for %s", (_name, input, expected) => {
    expect(getPublicationBlockReasons(input)).toEqual(expected);
  });

  test("ready_to_publish is equivalent to an empty canonical reason list", () => {
    const cases = [
      readyInput(),
      readyInput({ openBlockingIssueCount: 1 }),
      readyInput({ unsupportedAdditionCount: 1 }),
      unverifiedAnswerInput(),
      missingBlockInput()
    ];
    for (const [index, input] of cases.entries()) {
      const reasons = getPublicationBlockReasons(input);
      const publish = () =>
        createPublishedLessonSpec({
          ...input,
          lessonId: `lesson-${String(index)}`,
          version: 1
        });
      if (reasons.length === 0) expect(publish).not.toThrow();
      else expect(publish).toThrowError(PublicationBlockedError);
    }
  });

  test("returns every blocker once in deterministic order", () => {
    const input = unverifiedAnswerInput({ openBlockingIssueCount: 2, unsupportedAdditionCount: 3 });
    firstExercise(input.draft).provenance = {
      sourceRefs: [{ ...ref(), blockId: "missing-block" }]
    };
    expect(getPublicationBlockReasons(input)).toEqual([
      "blocking issues remain open",
      "unsupported additions remain",
      "answers remain unverified",
      "invalid SourceRef missing-block"
    ]);
  });
});

function readyInput(
  overrides: Partial<
    Pick<PublicationReadinessInput, "openBlockingIssueCount" | "unsupportedAdditionCount">
  > = {}
): PublicationReadinessInput {
  return {
    draft: fixtureDraft(),
    document: fixtureDocument(),
    openBlockingIssueCount: overrides.openBlockingIssueCount ?? 0,
    unsupportedAdditionCount: overrides.unsupportedAdditionCount ?? 0
  };
}

function unverifiedAnswerInput(
  overrides: Partial<
    Pick<PublicationReadinessInput, "openBlockingIssueCount" | "unsupportedAdditionCount">
  > = {}
) {
  const input = readyInput(overrides);
  const answer = firstExercise(input.draft).answerFields[0];
  if (!answer) throw new Error("Fixture answer is missing");
  firstExercise(input.draft).answerFields[0] = {
    ...answer,
    acceptedValues: [],
    provenance: "modelInferred",
    reviewStatus: "needsReview"
  };
  return input;
}

function crossDocumentInput() {
  const input = readyInput();
  firstExercise(input.draft).provenance = {
    sourceRefs: [{ ...ref(), sourceDocumentId: "source-other" }]
  };
  return input;
}

function missingBlockInput() {
  const input = readyInput();
  firstExercise(input.draft).provenance = {
    sourceRefs: [{ ...ref(), blockId: "missing-block" }]
  };
  return input;
}

function outOfRangeInput() {
  const input = readyInput();
  firstExercise(input.draft).provenance = {
    sourceRefs: [{ ...ref(), charStart: 0, charEnd: 999 }]
  };
  return input;
}

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
    blocks: [{ id: "block-1", pageIndex: 0, kind: "text", rawText: "Pick one A", order: 0 }],
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
