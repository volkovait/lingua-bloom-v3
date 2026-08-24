import type { DocumentIR, SourceBlock } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { extractPdfExercises } from "./pdf-extractors";

const sourceDocumentId = "source:test";
const documentIrId = "ir:test";

describe("PDF exercise extractors", () => {
  test("extracts all five interaction kinds with addressable options", () => {
    const document = fixtureDocument([
      "1 Choose the correct answer (a, b or c).",
      "1 Esther and Lisa ___ my new bike.",
      "a think\tb love\tc hate",
      "2 Put the words in the correct order to make sentences and questions.",
      "1 like / Jake / Does / job / his",
      "3 Complete the text with the correct form of the verb in brackets.",
      "My friend Sofia 1 __________ (love) Fridays.",
      "4 Choose the object that is different in each group.",
      "1 shoes\tjacket\tbread\ttrousers",
      "5 Complete the sentences with the words in the box.",
      "cereal\tchicken\toranges\trice\tsalt\ttea\tvegetables",
      "1 My favourite fruit is __________."
    ]);

    const result = extractPdfExercises(document, { documentIrId });
    expect(result.groups.map((group) => group.interactionKind)).toEqual([
      "singleChoice",
      "wordOrder",
      "bracketGap",
      "oddOneOut",
      "wordBankGap"
    ]);
    expect(result.groups.flatMap((group) => group.exercises)).toHaveLength(5);
    expect(
      result.groups
        .flatMap((group) => group.exercises)
        .flatMap((exercise) => exercise.options)
        .every((option) => option.sourceRefs.length > 0)
    ).toBe(true);
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
    id: documentIrId,
    sourceDocumentId,
    pages: [{ index: 0, width: 600, height: 800 }],
    blocks,
    warnings: []
  };
}
