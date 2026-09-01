import { UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import { describe, expect, it } from "vitest";

import { applyLayoutReviewSubmission } from "./apply-layout-review";

const ref = {
  sourceDocumentId: "source-1",
  documentIrId: "ir-1",
  blockId: "block-1",
  pageIndex: 0
};

function review() {
  return UnknownLayoutReviewSchema.parse({
    schemaVersion: "1.0.0",
    runId: "run-1",
    sourceDocumentId: "source-1",
    documentIrId: "ir-1",
    revision: 1,
    status: "active",
    candidates: [
      {
        id: "candidate-21",
        sourceOrdinal: 21,
        rawPrompt: "21 I spoke to ___ manager.\na a\nb the\nc any\nd some",
        classification: "unknown",
        confidence: 0,
        evidence: ["unclaimed"],
        sourceRefs: [ref]
      },
      {
        id: "candidate-22",
        sourceOrdinal: 22,
        rawPrompt:
          "22 I ___ early tomorrow.\na woke up\nb wake up\nc was waking up\nd am going to wake up",
        classification: "unknown",
        confidence: 0,
        evidence: ["unclaimed"],
        sourceRefs: [ref]
      }
    ],
    coverage: { detectedCandidateCount: 2, accountedCandidateCount: 0, status: "needsReview" },
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:00:00.000Z"
  });
}

describe("applyLayoutReviewSubmission", () => {
  it("persists a partial exclusion without creating an invalid draft", () => {
    const result = applyLayoutReviewSubmission({
      review: review(),
      actorId: "teacher-1",
      title: "Placement",
      submission: {
        expectedRevision: 1,
        idempotencyKey: "partial-decision-0001",
        decisions: [{ candidateId: "candidate-21", action: "exclude", reason: "Reference" }]
      }
    });
    expect(result.review).toMatchObject({ revision: 2, status: "active" });
    expect(result.review.coverage.accountedCandidateCount).toBe(1);
    expect(result.draft).toBeNull();
  });

  it("assembles a contract-valid draft after every candidate is classified", () => {
    const result = applyLayoutReviewSubmission({
      review: review(),
      actorId: "teacher-1",
      title: "Placement",
      submission: {
        expectedRevision: 1,
        idempotencyKey: "complete-decision-01",
        decisions: [
          {
            candidateId: "candidate-21",
            action: "classify",
            interactionKind: "singleChoice",
            reason: "Confirmed"
          },
          {
            candidateId: "candidate-22",
            action: "classify",
            interactionKind: "singleChoice",
            reason: "Confirmed"
          }
        ]
      }
    });
    expect(result.review).toMatchObject({ revision: 2, status: "resolved" });
    expect(result.draft?.groups[0]?.exercises).toHaveLength(2);
    expect(result.draft?.groups[0]?.exercises[0]?.options).toHaveLength(4);
    expect(result.answerIssues).toHaveLength(2);
  });

  it("keeps an all-excluded source in fallback instead of creating groups zero", () => {
    expect(() =>
      applyLayoutReviewSubmission({
        review: review(),
        actorId: "teacher-1",
        title: "Placement",
        submission: {
          expectedRevision: 1,
          idempotencyKey: "all-excluded-0001",
          decisions: [
            { candidateId: "candidate-21", action: "exclude", reason: "Not an exercise" },
            { candidateId: "candidate-22", action: "exclude", reason: "Not an exercise" }
          ]
        }
      })
    ).toThrow("ZERO_VALID_GROUP");
  });
});
