import { describe, expect, test } from "vitest";

import {
  MAX_ANSWER_FIELDS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_CODE_POINTS,
  countUnicodeCodePoints,
  evaluateAnswerFieldLimit,
  validateAnswerFieldCount,
  validatePdfByteSize,
  validatePdfPageCount,
  validateTextCharacterCount
} from "./import-limits";

describe("import limits", () => {
  test.each([
    [validatePdfPageCount, MAX_PDF_PAGES, "pdfPages"],
    [validatePdfByteSize, MAX_PDF_BYTES, "pdfBytes"],
    [validateAnswerFieldCount, MAX_ANSWER_FIELDS, "answerFields"]
  ] as const)("accepts an exact boundary and rejects one above", (validate, limit, limitType) => {
    expect(() => {
      validate(limit);
    }).not.toThrow();
    try {
      validate(limit + 1);
      throw new Error("Expected limit violation");
    } catch (error) {
      expect(error).toMatchObject({
        code: "SOURCE_TOO_LARGE",
        limitType,
        limit,
        actual: limit + 1,
        splitRequired: true,
        partsBecomeSeparateLessons: true
      });
    }
  });

  test("counts Unicode code points after CRLF/CR normalization instead of UTF-8 bytes", () => {
    expect(countUnicodeCodePoints("😀a")).toBe(2);
    expect(() => {
      validateTextCharacterCount("a".repeat(MAX_TEXT_CODE_POINTS));
    }).not.toThrow();
    expect(() => {
      validateTextCharacterCount(`${"a".repeat(MAX_TEXT_CODE_POINTS - 1)}\r\n`);
    }).not.toThrow();
    try {
      validateTextCharacterCount("😀".repeat(MAX_TEXT_CODE_POINTS + 1));
      throw new Error("Expected text character limit violation");
    } catch (error) {
      expect(error).toMatchObject({
        limitType: "textCharacters",
        actual: MAX_TEXT_CODE_POINTS + 1
      });
    }
  });

  test("turns 501 answer fields into a terminal failure before draft assembly", () => {
    expect(evaluateAnswerFieldLimit(500)).toEqual({ allowed: true });
    expect(evaluateAnswerFieldLimit(501)).toMatchObject({
      allowed: false,
      createDraft: false,
      failure: {
        code: "SOURCE_TOO_LARGE",
        kind: "terminal",
        manualResumeAllowed: false,
        limitType: "answerFields",
        limit: 500,
        actual: 501
      }
    });
  });
});
