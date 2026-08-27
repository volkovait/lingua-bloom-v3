import type { DocumentIR } from "@lingua-bloom/contracts";

import { normalizeTextWithSpans } from "./text-normalizer";

export interface TextDocumentIrInput {
  readonly id: string;
  readonly sourceDocumentId: string;
}

export function buildTextDocumentIr(rawText: string, input: TextDocumentIrInput): DocumentIR {
  const normalized = normalizeTextWithSpans(rawText);
  return {
    schemaVersion: "1.0.0",
    id: input.id,
    sourceDocumentId: input.sourceDocumentId,
    pages: [{ index: 0, width: 1, height: 1 }],
    blocks: [
      {
        id: "text:block:0",
        pageIndex: null,
        kind: "text",
        rawText,
        normalizedText: normalized.normalizedText,
        order: 0,
        bbox: null,
        confidence: 1
      }
    ],
    warnings: []
  };
}
