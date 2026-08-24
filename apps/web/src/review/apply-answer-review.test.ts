import type { ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { applyTeacherAnswerReview } from "./apply-answer-review";

describe("teacher answer review", () => {
  test("confirmation of a model suggestion becomes verified teacherSupplied evidence", () => {
    const result = applyTeacherAnswerReview(
      fixtureDraft("modelInferred"),
      {
        answerFieldId: "answer-1",
        replacementValue: " goes "
      },
      "decision-1"
    );
    expect(result.draft.groups[0]?.exercises[0]?.answerFields[0]).toEqual({
      id: "answer-1",
      acceptedValues: ["goes"],
      provenance: "teacherSupplied",
      reviewStatus: "verified",
      evidence: { reviewDecisionIds: ["decision-1"] }
    });
  });

  test("editing a source answer also becomes teacherSupplied", () => {
    const result = applyTeacherAnswerReview(
      fixtureDraft("sourceKey"),
      {
        answerFieldId: "answer-1",
        replacementValue: "went"
      },
      "decision-2"
    );
    expect(result.afterValue).toMatchObject({
      acceptedValues: ["went"],
      provenance: "teacherSupplied",
      reviewStatus: "verified",
      evidence: { reviewDecisionIds: ["decision-2"] }
    });
  });
});

function fixtureDraft(provenance: "modelInferred" | "sourceKey"): ReviewDraft {
  const ref = { sourceDocumentId: "source-1", documentIrId: "ir-1", blockId: "block-1" };
  return {
    schemaVersion: "1.0.0",
    title: "Lesson",
    sourceDocumentId: "source-1",
    documentIrId: "ir-1",
    groups: [
      {
        id: "group-1",
        ordinal: 1,
        instruction: "Complete",
        provenance: { sourceRefs: [ref] },
        exercises: [
          {
            id: "exercise-1",
            ordinal: 1,
            interactionKind: "bracketGap",
            prompt: "He ___",
            provenance: { sourceRefs: [ref] },
            options: [],
            answerFields: [
              {
                id: "answer-1",
                acceptedValues: ["goes"],
                provenance,
                reviewStatus: provenance === "sourceKey" ? "verified" : "needsReview",
                evidence: { sourceRefs: [ref] },
                confidence: provenance === "modelInferred" ? 0.9 : undefined
              }
            ]
          }
        ]
      }
    ],
    coverage: {
      entries: [],
      detectedCandidateCount: 1,
      accountedCandidateCount: 1,
      unsupportedAdditionCount: 0,
      status: provenance === "sourceKey" ? "passed" : "needsReview"
    }
  };
}
