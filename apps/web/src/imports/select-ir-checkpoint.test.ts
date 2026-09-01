import { PDF_DOCUMENT_IR_PARSER_VERSION } from "@lingua-bloom/document-ingestion";
import { describe, expect, it } from "vitest";

import { selectDocumentIrCheckpoint } from "./select-ir-checkpoint";

const base = {
  schemaVersion: "1.0.0",
  sourceDocumentId: "source-1",
  pages: [{ index: 0, width: 600, height: 800 }],
  blocks: [],
  warnings: []
};

describe("selectDocumentIrCheckpoint", () => {
  it("rejects a legacy PDF checkpoint and selects the current parser version", () => {
    const current = {
      id: "ir-current",
      payload: { ...base, parserVersion: PDF_DOCUMENT_IR_PARSER_VERSION }
    };
    expect(
      selectDocumentIrCheckpoint("pdf", [{ id: "ir-legacy", payload: base }, current])
    ).toEqual(current);
  });

  it("returns no PDF checkpoint when every persisted IR is stale", () => {
    expect(selectDocumentIrCheckpoint("pdf", [{ id: "ir-legacy", payload: base }])).toBeUndefined();
  });

  it("preserves the existing first-checkpoint behavior for text imports", () => {
    const first = { id: "text-ir", payload: base };
    expect(selectDocumentIrCheckpoint("text", [first])).toEqual(first);
  });
});
