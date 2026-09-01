import { describe, expect, it } from "vitest";

import { extractPdfExercises } from "./pdf-extractors";

describe("unknown PDF layout fallback", () => {
  it("returns review candidates instead of an invalid empty draft input", () => {
    const result = extractPdfExercises(
      {
        schemaVersion: "1.0.0",
        id: "ir-1",
        sourceDocumentId: "source-1",
        pages: [{ index: 0, width: 600, height: 800 }],
        warnings: [],
        blocks: [
          {
            id: "block-1",
            pageIndex: 0,
            kind: "text",
            rawText: "21 This layout is not supported yet",
            order: 0
          },
          {
            id: "block-2",
            pageIndex: 0,
            kind: "text",
            rawText: "a one  b two  c three  d four",
            order: 1
          }
        ]
      },
      { documentIrId: "ir-1" }
    );

    expect(result.groups).toEqual([]);
    expect(result.unknownCandidates).toHaveLength(1);
    expect(result.unknownCandidates?.[0]).toMatchObject({
      sourceOrdinal: 21,
      classification: "unknown"
    });
    expect(result.coverage).toMatchObject({
      detectedCandidateCount: 1,
      accountedCandidateCount: 0,
      status: "needsReview"
    });
  });
});
