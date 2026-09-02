import { MAX_PDF_PAGES, MAX_TEXT_CODE_POINTS } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { assertPdfPageLimit } from "./pdf-to-ir";
import { assertTextCharacterLimit, buildTextDocumentIr } from "./text-to-ir";

describe("source admission and the common DocumentIR boundary", () => {
  test("accepts five PDF pages and rejects six", () => {
    expect(() => {
      assertPdfPageLimit(MAX_PDF_PAGES);
    }).not.toThrow();
    expect(() => {
      assertPdfPageLimit(MAX_PDF_PAGES + 1);
    }).toThrow("5 page limit");
  });

  test("counts Unicode characters after newline normalization", () => {
    expect(() => {
      assertTextCharacterLimit("😀".repeat(MAX_TEXT_CODE_POINTS));
    }).not.toThrow();
    expect(() => {
      assertTextCharacterLimit(`${"😀".repeat(MAX_TEXT_CODE_POINTS - 1)}\r\n`);
    }).not.toThrow();
    expect(() => {
      assertTextCharacterLimit("😀".repeat(MAX_TEXT_CODE_POINTS + 1));
    }).toThrow("30000 Unicode character limit");
  });

  test("creates versioned, ordered text blocks small enough for bounded windows", () => {
    const document = buildTextDocumentIr(`${"字".repeat(4_500)}\r\nSecond line`, {
      id: "ir:text",
      sourceDocumentId: "source:text"
    });
    expect(document).toMatchObject({
      parserVersion: "text-blocks/2.0.0",
      sourceKind: "text"
    });
    expect(document.blocks).toHaveLength(2);
    expect(document.blocks.map((block) => block.order)).toEqual([0, 1]);
    expect(document.blocks.map((block) => block.rawText).join("")).toBe(
      `${"字".repeat(4_500)}\r\nSecond line`
    );
    expect(document.blocks.every((block) => Array.from(block.rawText).length <= 4_000)).toBe(true);
  });
});
