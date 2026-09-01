import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  buildPdfDocumentIr,
  createDocumentIrFromTextItems,
  PDF_DOCUMENT_IR_PARSER_VERSION
} from "./pdf-to-ir";
import { orderBlocksByColumns } from "./reading-order";

describe("PDF DocumentIR", () => {
  test("preserves page geometry and exposes addressable text blocks", async () => {
    const bytes = new Uint8Array(
      await readFile(resolve(import.meta.dirname, "../../../tests/fixtures/sources/1_page.pdf"))
    );
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:1_page",
      sourceDocumentId: "source:1_page"
    });

    expect(document.parserVersion).toBe(PDF_DOCUMENT_IR_PARSER_VERSION);
    expect(document.pages).toEqual([{ index: 0, width: 594.96, height: 842.04 }]);
    expect(document.blocks.length).toBeGreaterThan(60);
    expect(document.blocks.every((block) => block.pageIndex === 0 && block.bbox)).toBe(true);
    expect(document.blocks.map((block) => block.id)).toEqual(
      expect.arrayContaining(["page:0:block:0", "page:0:block:1"])
    );
  });

  test("reconstructs all vector answer lines in the placement fixture as blanks", async () => {
    const bytes = new Uint8Array(
      await readFile(
        resolve(import.meta.dirname, "../../../tests/fixtures/sources/placement_test.pdf")
      )
    );
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:placement",
      sourceDocumentId: "source:placement"
    });

    expect(
      document.blocks.reduce(
        (count, block) => count + (block.rawText.match(/___/g)?.length ?? 0),
        0
      )
    ).toBe(50);
  });

  test("orders a two-column page down the left column before the right column", () => {
    const blocks = createDocumentIrFromTextItems(
      [
        { text: "right top", pageIndex: 0, x: 330, y: 80, width: 80, height: 10 },
        { text: "left bottom", pageIndex: 0, x: 50, y: 200, width: 80, height: 10 },
        { text: "left top", pageIndex: 0, x: 50, y: 80, width: 80, height: 10 },
        { text: "right bottom", pageIndex: 0, x: 330, y: 200, width: 80, height: 10 }
      ],
      { id: "ir", sourceDocumentId: "source", pages: [{ index: 0, width: 600, height: 800 }] }
    ).blocks;

    expect(orderBlocksByColumns(blocks, 600).map((block) => block.rawText)).toEqual([
      "left top",
      "left bottom",
      "right top",
      "right bottom"
    ]);
  });
});
