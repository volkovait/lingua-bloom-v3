import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildTextDocumentIr } from "@lingua-bloom/document-ingestion";
import { matchesEnglishAnswer } from "@lingua-bloom/domain";
import { extractTextExercises } from "@lingua-bloom/exercise-extraction";
import { describe, expect, test } from "vitest";

interface RawGolden {
  readonly summary: {
    readonly numberedItemCount: number;
    readonly bracketExpressionCount: number;
    readonly contextualDialogueEllipsisCount: number;
    readonly answerFieldCount: number;
    readonly requiredWarnings: readonly string[];
    readonly generatedContinuationCount: number;
  };
  readonly items: readonly {
    readonly itemNumber: number;
    readonly answerFields: readonly {
      readonly sourceVerb?: string;
      readonly sourceMarker?: string;
      readonly acceptedValues?: readonly string[];
    }[];
  }[];
}

describe("raw.txt golden evaluation", () => {
  test("accounts for every item and answer marker without inventing a continuation", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const raw = await readFile(resolve(root, "tests/fixtures/sources/raw.txt"), "utf8");
    const golden = JSON.parse(
      await readFile(resolve(root, "tests/golden/raw.expected.json"), "utf8")
    ) as RawGolden;
    const document = buildTextDocumentIr(raw, {
      id: "ir:raw",
      sourceDocumentId: "source:raw"
    });
    const result = extractTextExercises(document, { documentIrId: "ir:raw" });
    const exercises = result.groups.flatMap((group) => group.exercises);
    const sourceBlock = document.blocks[0];

    expect(exercises).toHaveLength(golden.summary.numberedItemCount);
    expect(exercises.map((exercise) => exercise.itemOrdinal)).toEqual(
      golden.items.map((item) => item.itemNumber)
    );
    expect(exercises.flatMap((exercise) => exercise.answerFields)).toHaveLength(
      golden.summary.answerFieldCount
    );
    expect(exercises.flatMap((exercise) => exercise.answerFields)).toHaveLength(
      golden.summary.bracketExpressionCount
    );
    expect(
      exercises.reduce(
        (count, exercise) =>
          count + (exercise.prompt.match(/(?:No|Yes),\s+(?:I|she)\s+\.{3,}/giu)?.length ?? 0),
        0
      )
    ).toBe(golden.summary.contextualDialogueEllipsisCount);
    expect(result.coverage.unsupportedAdditionCount).toBe(
      golden.summary.generatedContinuationCount
    );
    expect(
      golden.summary.requiredWarnings.every((code) =>
        result.issues.some((issue) => issue.code === code)
      )
    ).toBe(true);
    expect(exercises.at(-1)?.prompt.endsWith("We")).toBe(true);
    expect(sourceBlock?.rawText).toBe(raw);
    const item17Question = golden.items
      .find((item) => item.itemNumber === 17)
      ?.answerFields.at(0)?.acceptedValues;
    const item17 = golden.items.find((item) => item.itemNumber === 17);
    const extractedItem17 = exercises.find((exercise) => exercise.itemOrdinal === 17);
    expect(item17?.answerFields).toHaveLength(2);
    expect(extractedItem17?.answerFields).toHaveLength(2);
    expect(extractedItem17?.answerFields.map((field) => field.sourceValue)).toEqual([
      "to wear",
      "to wear"
    ]);
    expect(item17Question).toEqual(["Do you wear"]);
    expect(matchesEnglishAnswer("DO YOU WEAR?", item17Question ?? [])).toBe(true);
    expect(matchesEnglishAnswer("did you wear", item17Question ?? [])).toBe(false);
    expect(
      exercises.every((exercise) =>
        exercise.answerFields.every((field) =>
          field.sourceRefs.every(
            (ref) =>
              ref.sourceDocumentId === "source:raw" &&
              ref.documentIrId === "ir:raw" &&
              ref.blockId === sourceBlock?.id
          )
        )
      )
    ).toBe(true);
  });
});
