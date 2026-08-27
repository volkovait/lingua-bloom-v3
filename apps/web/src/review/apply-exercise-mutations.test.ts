import { ReviewDraftSchema, type ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import {
  applyExerciseCreate,
  applyExerciseDelete,
  getIssueIdsResolvedByExerciseEdit
} from "./apply-exercise-mutations";

describe("teacher exercise mutations", () => {
  test("adds a verified teacherSupplied exercise with decision provenance", () => {
    const result = applyExerciseCreate(
      fixtureDraft(),
      {
        groupId: "group:1",
        prompt: "Complete the new sentence: ...",
        interactionKind: "inlineGap",
        options: [],
        answerValues: ["the"]
      },
      "decision:add",
      "teacher:exercise:new"
    );
    const exercise = result.draft.groups[0]?.exercises[1];
    expect(exercise).toMatchObject({
      id: "teacher:exercise:new",
      ordinal: 2,
      interactionKind: "inlineGap",
      provenance: { reviewDecisionIds: ["decision:add"] }
    });
    expect(exercise?.answerFields[0]).toMatchObject({
      acceptedValues: ["the"],
      provenance: "teacherSupplied",
      reviewStatus: "verified",
      evidence: { reviewDecisionIds: ["decision:add"] }
    });
    expect(result.draft.coverage.unsupportedAdditionCount).toBe(0);
  });

  test("deletes an exercise, records the source candidate as a decision and protects the final item", () => {
    const withTwo = applyExerciseCreate(
      fixtureDraft(),
      {
        groupId: "group:1",
        prompt: "Second",
        interactionKind: "inlineGap",
        options: [],
        answerValues: ["a"]
      },
      "decision:add",
      "teacher:exercise:new"
    ).draft;
    const deleted = applyExerciseDelete(
      withTwo,
      { exerciseId: "group:1:item:1", reason: "Not needed" },
      "decision:delete"
    );
    expect(deleted.draft.groups[0]?.exercises.map((exercise) => exercise.id)).toEqual([
      "teacher:exercise:new"
    ]);
    expect(deleted.draft.coverage.entries[0]?.outcome).toEqual({
      kind: "decision",
      reviewDecisionId: "decision:delete"
    });
    expect(() =>
      applyExerciseDelete(
        deleted.draft,
        { exerciseId: "teacher:exercise:new", reason: "Remove final" },
        "decision:final"
      )
    ).toThrow("final exercise");
  });

  test("resolves only the open SOURCE_TRUNCATED issue attached to an edited exercise", () => {
    const issue = (id: string, code: string, entityIds: string[], resolution = "open") => ({
      id,
      resolution: resolution as "open" | "resolved" | "acceptedRisk",
      payload: { code, entityIds }
    });
    expect(
      getIssueIdsResolvedByExerciseEdit(
        [
          issue("truncated:target", "SOURCE_TRUNCATED", ["group:1:item:18"]),
          issue("answer:target", "ANSWER_UNVERIFIED", ["group:1:item:18"]),
          issue("truncated:other", "SOURCE_TRUNCATED", ["group:1:item:17"]),
          issue("truncated:resolved", "SOURCE_TRUNCATED", ["group:1:item:18"], "resolved")
        ],
        "group:1:item:18"
      )
    ).toEqual(["truncated:target"]);
  });
});

function fixtureDraft(): ReviewDraft {
  return ReviewDraftSchema.parse({
    schemaVersion: "1.0.0",
    title: "Fixture",
    sourceDocumentId: "source:test",
    documentIrId: "ir:test",
    groups: [
      {
        id: "group:1",
        ordinal: 1,
        instruction: "Complete.",
        provenance: { sourceRefs: [sourceRef("block:instruction")] },
        exercises: [
          {
            id: "group:1:item:1",
            ordinal: 1,
            interactionKind: "bracketGap",
            prompt: "(go)",
            provenance: { sourceRefs: [sourceRef("block:item")] },
            options: [],
            answerFields: [
              {
                id: "group:1:item:1:answer:1",
                acceptedValues: [],
                provenance: "deterministicRule",
                reviewStatus: "needsReview",
                evidence: { sourceRefs: [sourceRef("block:item")] }
              }
            ]
          }
        ]
      }
    ],
    coverage: {
      entries: [
        {
          candidateId: "candidate:1",
          outcome: { kind: "exercise", exerciseIds: ["group:1:item:1"] }
        }
      ],
      detectedCandidateCount: 1,
      accountedCandidateCount: 1,
      unsupportedAdditionCount: 0,
      status: "needsReview"
    }
  });
}

function sourceRef(blockId: string) {
  return {
    sourceDocumentId: "source:test",
    documentIrId: "ir:test",
    blockId,
    charStart: 0,
    charEnd: 1,
    pageIndex: 0,
    bbox: null
  };
}
