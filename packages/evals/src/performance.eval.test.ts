import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractPdfExercises } from "@lingua-bloom/exercise-extraction";
import {
  evaluateAnswerFieldLimit,
  MAX_ANSWER_FIELDS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_CODE_POINTS,
  SourceTooLargeError,
  validateAnswerFieldCount,
  validatePdfByteSize,
  validatePdfPageCount,
  validateTextCharacterCount
} from "@lingua-bloom/lesson-pipeline";
import { describe, expect, test } from "vitest";

const IMPORT_ACCEPTANCE_P95_MS = 2_000;
const ONE_PAGE_FULL_PARSE_P95_MS = 60_000;

describe("import performance and exact boundary evaluation", () => {
  test("accepts exact limits and rejects the first value above every limit", () => {
    expect(() => {
      validatePdfPageCount(1);
    }).not.toThrow();
    expect(() => {
      validatePdfPageCount(5);
    }).not.toThrow();
    expect(() => {
      validatePdfPageCount(MAX_PDF_PAGES);
    }).not.toThrow();
    expectLimitFailure(() => {
      validatePdfPageCount(MAX_PDF_PAGES + 1);
    }, "pdfPages");

    expect(() => {
      validatePdfByteSize(MAX_PDF_BYTES);
    }).not.toThrow();
    expectLimitFailure(() => {
      validatePdfByteSize(MAX_PDF_BYTES + 1);
    }, "pdfBytes");

    const exactText = "😀".repeat(MAX_TEXT_CODE_POINTS);
    expect(() => {
      validateTextCharacterCount(exactText);
    }).not.toThrow();
    expectLimitFailure(() => {
      validateTextCharacterCount(`${exactText}a`);
    }, "textCharacters");

    expect(() => {
      validateAnswerFieldCount(MAX_ANSWER_FIELDS);
    }).not.toThrow();
    expectLimitFailure(() => {
      validateAnswerFieldCount(MAX_ANSWER_FIELDS + 1);
    }, "answerFields");
    expect(evaluateAnswerFieldLimit(500)).toEqual({ allowed: true });
    expect(evaluateAnswerFieldLimit(501)).toMatchObject({
      allowed: false,
      createDraft: false,
      failure: {
        code: "SOURCE_TOO_LARGE",
        kind: "terminal",
        limitType: "answerFields",
        limit: 500,
        actual: 501
      }
    });
  });

  test("keeps the import admission boundary matrix below the p95 goal", () => {
    const exactText = "a".repeat(MAX_TEXT_CODE_POINTS);
    const durations = Array.from({ length: 25 }, () =>
      measure(() => {
        validatePdfPageCount(1);
        validatePdfPageCount(5);
        validatePdfPageCount(MAX_PDF_PAGES);
        expectLimitFailure(() => {
          validatePdfPageCount(MAX_PDF_PAGES + 1);
        }, "pdfPages");
        validatePdfByteSize(52_428_800);
        validateTextCharacterCount(exactText);
        validateAnswerFieldCount(500);
        expect(evaluateAnswerFieldLimit(501).allowed).toBe(false);
      })
    );

    expect(percentile95(durations)).toBeLessThan(IMPORT_ACCEPTANCE_P95_MS);
  });

  test("keeps one-page text PDF full parse below the p95 goal", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/1_page.pdf"))
    );
    const durations: number[] = [];

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const startedAt = performance.now();
      const document = await buildPdfDocumentIr(new Uint8Array(bytes), {
        id: `ir:performance:${String(iteration)}`,
        sourceDocumentId: "source:performance"
      });
      const result = extractPdfExercises(document, {
        documentIrId: "ir:performance:" + String(iteration)
      });
      expect(result.groups).toHaveLength(5);
      expect(result.groups.flatMap((group) => group.exercises)).toHaveLength(34);
      durations.push(performance.now() - startedAt);
    }

    expect(percentile95(durations)).toBeLessThan(ONE_PAGE_FULL_PARSE_P95_MS);
  }, 120_000);
});

function expectLimitFailure(action: () => void, limitType: SourceTooLargeError["limitType"]): void {
  try {
    action();
    throw new Error("Expected SourceTooLargeError");
  } catch (error) {
    expect(error).toBeInstanceOf(SourceTooLargeError);
    expect(error).toMatchObject({ limitType });
  }
}

function measure(action: () => void): number {
  const startedAt = performance.now();
  action();
  return performance.now() - startedAt;
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? Number.POSITIVE_INFINITY;
}
