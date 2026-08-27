import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractPdfExercises, validateSourceLineage } from "@lingua-bloom/exercise-extraction";
import { describe, expect, test } from "vitest";

interface Golden {
  summary: {
    pageCount: number;
    exerciseGroupCount: number;
    completeGroupCount: number;
    partialGroupCount: number;
    answerableItemCount: number;
    answerFieldCount: number;
    referenceBlockCount: number;
    unsupportedAdditionCount: number;
  };
  groups: readonly {
    exerciseNumber: number;
    completeness: "complete" | "partial";
    missingBoundary?: "start";
    itemCount: number;
    answerFieldCount: number;
    pages: readonly number[];
  }[];
  referenceBlocks: readonly (readonly string[])[];
}

describe("articles_4_pages.pdf golden evaluation", () => {
  test("stitches page continuations, preserves reference blocks and isolates the partial group", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/articles_4_pages.pdf"))
    );
    const golden = JSON.parse(
      await readFile(resolve(root, "tests/golden/articles_4_pages.expected.json"), "utf8")
    ) as Golden;
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:articles_4_pages",
      sourceDocumentId: "source:articles_4_pages"
    });
    const result = extractPdfExercises(document, { documentIrId: "ir:articles_4_pages" });
    const exercises = result.groups.flatMap((group) => group.exercises);

    expect(document.pages).toHaveLength(golden.summary.pageCount);
    expect(result.groups).toHaveLength(golden.summary.exerciseGroupCount);
    expect(result.groups.filter((group) => group.completeness === "complete")).toHaveLength(
      golden.summary.completeGroupCount
    );
    expect(result.groups.filter((group) => group.completeness === "partial")).toHaveLength(
      golden.summary.partialGroupCount
    );
    expect(exercises).toHaveLength(golden.summary.answerableItemCount);
    expect(exercises.flatMap((exercise) => exercise.answerFields)).toHaveLength(
      golden.summary.answerFieldCount
    );
    expect(result.referenceBlocks).toHaveLength(golden.summary.referenceBlockCount);
    expect(result.coverage.unsupportedAdditionCount).toBe(golden.summary.unsupportedAdditionCount);
    expect(result.groups.map((group) => group.ordinal)).toEqual(
      golden.groups.map((group) => group.exerciseNumber)
    );
    expect(result.groups.map((group) => group.exercises.length)).toEqual(
      golden.groups.map((group) => group.itemCount)
    );
    expect(
      result.groups.map(
        (group) => group.exercises.flatMap((exercise) => exercise.answerFields).length
      )
    ).toEqual(golden.groups.map((group) => group.answerFieldCount));
    expect(
      result.groups.map((group) =>
        [
          ...new Set(
            [
              ...group.sourceRefs,
              ...group.exercises.flatMap((exercise) => exercise.sourceRefs)
            ].flatMap((ref) => (ref.pageIndex == null ? [] : [ref.pageIndex]))
          )
        ].sort()
      )
    ).toEqual(golden.groups.map((group) => [...group.pages]));
    expect(result.referenceBlocks?.map((block) => block.lines.map((line) => line.rawText))).toEqual(
      golden.referenceBlocks
    );
    expect(result.issues.some((issue) => issue.code === "SOURCE_TRUNCATED")).toBe(true);
    expect(result.groups[0]).toMatchObject({
      completeness: "partial",
      missingBoundary: "start"
    });

    const refs = [
      ...result.groups.flatMap((group) => [
        ...group.sourceRefs,
        ...group.exercises.flatMap((exercise) => [
          ...exercise.sourceRefs,
          ...exercise.answerFields.flatMap((field) => field.sourceRefs)
        ])
      ]),
      ...(result.referenceBlocks ?? []).flatMap((block) =>
        block.lines.flatMap((line) => line.sourceRefs)
      )
    ];
    const blocks = new Map(document.blocks.map((block) => [block.id, block]));
    await expect(
      validateSourceLineage(refs, "source:articles_4_pages", "ir:articles_4_pages", {
        irBelongsToSource: () => Promise.resolve(true),
        getBlock: (_documentIrId, blockId) => {
          const block = blocks.get(blockId);
          return Promise.resolve(
            block
              ? {
                  rawTextLength: block.rawText.length,
                  ...(block.pageIndex !== undefined ? { pageIndex: block.pageIndex } : {}),
                  ...(block.bbox !== undefined ? { bbox: block.bbox } : {})
                }
              : null
          );
        }
      })
    ).resolves.toEqual([]);
  });
});
