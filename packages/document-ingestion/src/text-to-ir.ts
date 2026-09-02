import {
  countUnicodeCodePointsAfterLineEndingNormalization,
  MAX_TEXT_CODE_POINTS,
  normalizeLineEndings,
  type DocumentIR,
  type SourceBlock
} from "@lingua-bloom/contracts";

import { normalizeTextWithSpans } from "./text-normalizer";

export interface TextDocumentIrInput {
  readonly id: string;
  readonly sourceDocumentId: string;
}

export const TEXT_DOCUMENT_IR_PARSER_VERSION = "text-blocks/2.0.0";
const MAX_TEXT_BLOCK_CODE_POINTS = 4_000;

export function buildTextDocumentIr(rawText: string, input: TextDocumentIrInput): DocumentIR {
  assertTextCharacterLimit(rawText);
  const blocks = splitTextBlocks(rawText);
  return {
    schemaVersion: "1.0.0",
    parserVersion: TEXT_DOCUMENT_IR_PARSER_VERSION,
    sourceKind: "text",
    id: input.id,
    sourceDocumentId: input.sourceDocumentId,
    pages: [{ index: 0, width: 1, height: 1 }],
    blocks,
    warnings: []
  };
}

export function assertTextCharacterLimit(rawText: string): void {
  const actual = countUnicodeCodePointsAfterLineEndingNormalization(rawText);
  if (actual > MAX_TEXT_CODE_POINTS) {
    throw new RangeError(
      `Text exceeds the ${String(MAX_TEXT_CODE_POINTS)} Unicode character limit (${String(actual)})`
    );
  }
}

function splitTextBlocks(rawText: string): SourceBlock[] {
  const codePoints = Array.from(rawText);
  const chunks: string[] = [];
  for (let offset = 0; offset < codePoints.length; offset += MAX_TEXT_BLOCK_CODE_POINTS) {
    chunks.push(codePoints.slice(offset, offset + MAX_TEXT_BLOCK_CODE_POINTS).join(""));
  }
  if (chunks.length === 0) chunks.push(normalizeLineEndings(rawText));
  return chunks.map((chunk, order) => {
    const normalized = normalizeTextWithSpans(chunk);
    return {
      id: `text:block:${String(order)}`,
      pageIndex: null,
      kind: "text" as const,
      rawText: chunk,
      normalizedText: normalized.normalizedText,
      order,
      bbox: null,
      confidence: 1
    };
  });
}
