import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractPdfExercises } from "@lingua-bloom/exercise-extraction";
import { describe, expect, it } from "vitest";

import { applyLayoutReviewSubmission } from "./apply-layout-review";

describe("placement PDF prompt reconstruction", () => {
  it("preserves one canonical blank in every placement-test prompt", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/placement_test.pdf"))
    );
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir-placement",
      sourceDocumentId: "source-placement"
    });
    const extraction = extractPdfExercises(document, { documentIrId: "ir-placement" });
    const candidates = extraction.unknownCandidates ?? [];
    const review = UnknownLayoutReviewSchema.parse({
      schemaVersion: "1.0.0",
      runId: "run-placement",
      sourceDocumentId: document.sourceDocumentId,
      documentIrId: document.id,
      revision: 1,
      status: "active",
      candidates,
      decisions: [],
      coverage: {
        detectedCandidateCount: candidates.length,
        accountedCandidateCount: 0,
        status: "needsReview"
      },
      createdAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:00:00.000Z"
    });
    const result = applyLayoutReviewSubmission({
      review,
      actorId: "teacher-1",
      title: "Placement",
      submission: {
        expectedRevision: 1,
        idempotencyKey: "placement-all-choice-01",
        decisions: candidates.map((candidate) => ({
          candidateId: candidate.id,
          action: "classify" as const,
          interactionKind: "singleChoice" as const,
          reason: "Confirmed"
        }))
      }
    });
    const exercises = result.draft?.groups[0]?.exercises ?? [];

    expect(candidates).toHaveLength(50);
    expect(exercises).toHaveLength(50);
    expect(exercises.map((exercise) => exercise.prompt.match(/___/g)?.length ?? 0)).toEqual(
      Array.from({ length: 50 }, () => 1)
    );
    expect(exercises[4]?.prompt).toBe("___ the rain, they moved the concert inside.");
    expect(exercises[5]?.prompt).toBe("___ me at the restaurant after work.");
    expect(exercises[12]?.prompt).toBe("The cinema is ___ Hudson Street.");
    expect(exercises[22]?.prompt).toBe("I don’t know anyone ___ lives here. Do you?");
    expect(exercises[30]?.prompt).toBe("I like taking black and white ___ with my camera.");
    expect(exercises[37]?.prompt).toBe("Food and art are part of people’s ___.");
    expect(exercises[38]?.prompt).toBe("It’s so hot today! What’s the ___?");
    expect(exercises[40]?.prompt).toBe("___, the website doesn’t accept credit card payments.");
  });
});
