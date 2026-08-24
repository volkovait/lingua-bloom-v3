import type { DocumentIR, SourceBlock } from "@lingua-bloom/contracts";
import { classifyPdfSections, evaluatePdfTextLayer } from "@lingua-bloom/document-ingestion";
import { describe, expect, test } from "vitest";

import { extractAnswerKeyEntries, reconcileAnswerKey } from "./answer-key-extractor";
import { extractPdfExercises } from "./pdf-extractors";

describe("PDF edge cases", () => {
  test("keeps mixed examples and answer keys out of exercise candidates", () => {
    const document = fixtureDocument([
      "Example: I like tea.",
      "1 Choose the correct answer (a, b or c).",
      "1 I ___ tea.",
      "a like\tb likes\tc liking",
      "Answer key",
      "1 a"
    ]);
    const result = extractPdfExercises(document, { documentIrId: "ir:test" });
    expect(classifyPdfSections(document).map((section) => section.kind)).toEqual([
      "example",
      "instruction",
      "exercise",
      "unknown",
      "answerKey",
      "answerKey"
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.exercises).toHaveLength(1);
    expect(result.groups[0]?.exercises[0]?.prompt).toBe("I ___ tea.");
  });

  test("maps a source answer key and reports conflicting entries", () => {
    const document = fixtureDocument(["Answer key", "1 a", "1 b"]);
    const entries = extractAnswerKeyEntries(document, "ir:test");
    const result = reconcileAnswerKey(
      [
        {
          id: "group:1:item:1",
          groupOrdinal: 1,
          itemOrdinal: 1,
          options: [
            { id: "a", value: "like" },
            { id: "b", value: "likes" }
          ]
        }
      ],
      entries
    );
    expect(result.answers).toHaveLength(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "ANSWER_KEY_CONFLICT", severity: "blocking" })
    ]);

    const mapped = reconcileAnswerKey(
      [
        {
          id: "group:1:item:1",
          groupOrdinal: 1,
          itemOrdinal: 1,
          options: [
            { id: "a", value: "like" },
            { id: "b", value: "likes" }
          ]
        }
      ],
      entries.slice(0, 1)
    );
    expect(mapped).toEqual({
      answers: [
        expect.objectContaining({
          acceptedValues: ["like"],
          provenance: "sourceKey",
          reviewStatus: "verified"
        })
      ],
      issues: []
    });
  });

  test("blocks a PDF with no text layer instead of producing an empty lesson", () => {
    const document = fixtureDocument([]);
    expect(evaluatePdfTextLayer(document)).toEqual([
      expect.objectContaining({ code: "OCR_REQUIRED", severity: "blocking" })
    ]);
  });

  test("creates an addressable review issue for low-confidence text", () => {
    const document = fixtureDocument(["uncertain text"]);
    const block = document.blocks[0];
    if (!block) throw new Error("fixture block missing");
    const uncertain = { ...document, blocks: [{ ...block, confidence: 0.6 }] };
    expect(evaluatePdfTextLayer(uncertain)).toEqual([
      expect.objectContaining({
        code: "READING_ORDER_UNCERTAIN",
        severity: "warning",
        evidence: [expect.objectContaining({ blockId: "block:0" })]
      })
    ]);
  });
});

function fixtureDocument(lines: readonly string[]): DocumentIR {
  const blocks: SourceBlock[] = lines.map((rawText, index) => ({
    id: `block:${String(index)}`,
    pageIndex: 0,
    kind: "text",
    rawText,
    order: index,
    bbox: { x: 50, y: 50 + index * 15, width: 500, height: 10 },
    confidence: 1
  }));
  return {
    schemaVersion: "1.0.0",
    id: "ir:test",
    sourceDocumentId: "source:test",
    pages: [{ index: 0, width: 600, height: 800 }],
    blocks,
    warnings: []
  };
}
