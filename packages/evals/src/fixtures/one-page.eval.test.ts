import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractPdfExercises, validateSourceLineage } from "@lingua-bloom/exercise-extraction";
import { describe, expect, test } from "vitest";

interface GoldenManifest {
  readonly summary: {
    readonly exerciseGroupCount: number;
    readonly answerableItemCount: number;
    readonly unsupportedAdditionCount: number;
  };
  readonly groups: readonly {
    readonly exerciseNumber: number;
    readonly title: string;
    readonly interactionKind: string;
    readonly optionCountPerItem: number;
    readonly sharedResourceCount?: number;
    readonly sharedResourceEntryCount?: number;
    readonly items: readonly { readonly itemNumber: number }[];
  }[];
}

describe("1_page.pdf golden evaluation", () => {
  test("reproduces all groups and answerable items without unsupported additions", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/1_page.pdf"))
    );
    const golden = JSON.parse(
      await readFile(resolve(root, "tests/golden/1_page.expected.json"), "utf8")
    ) as GoldenManifest;
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:1_page",
      sourceDocumentId: "source:1_page"
    });
    const result = extractPdfExercises(document, { documentIrId: "ir:1_page" });
    const exercises = result.groups.flatMap((group) => group.exercises);

    expect(result.groups).toHaveLength(golden.summary.exerciseGroupCount);
    expect(exercises).toHaveLength(golden.summary.answerableItemCount);
    expect(result.coverage.unsupportedAdditionCount).toBe(golden.summary.unsupportedAdditionCount);
    expect(result.groups.map((group) => group.interactionKind)).toEqual(
      golden.groups.map((group) => group.interactionKind)
    );
    expect(result.groups.map((group) => group.ordinal)).toEqual(
      golden.groups.map((group) => group.exerciseNumber)
    );
    expect(result.groups.map((group) => group.instruction)).toEqual(
      golden.groups.map((group) => group.title)
    );
    expect(result.groups.map((group) => group.exercises.length)).toEqual(
      golden.groups.map((group) => group.items.length)
    );
    expect(
      result.groups.map((group) => group.exercises.map((exercise) => exercise.itemOrdinal))
    ).toEqual(golden.groups.map((group) => group.items.map((item) => item.itemNumber)));
    expect(
      result.groups.every((group, index) =>
        group.exercises.every(
          (exercise) => exercise.options.length === golden.groups[index]?.optionCountPerItem
        )
      )
    ).toBe(true);
    const wordBankGroup = result.groups.find((group) => group.interactionKind === "wordBankGap");
    const wordBankGolden = golden.groups.find((group) => group.interactionKind === "wordBankGap");
    expect(wordBankGroup?.sharedResources).toHaveLength(wordBankGolden?.sharedResourceCount ?? 0);
    expect(wordBankGroup?.sharedResources?.[0]?.entries).toHaveLength(
      wordBankGolden?.sharedResourceEntryCount ?? 0
    );
    expect(
      wordBankGroup?.exercises.every(
        (exercise) =>
          exercise.options.length === 0 &&
          exercise.sharedResourceId === wordBankGroup.sharedResources?.[0]?.id
      )
    ).toBe(true);
    expect(
      exercises.every(
        (exercise) =>
          exercise.sourceRefs.length > 0 &&
          exercise.answerFields.every((field) =>
            field.sourceRefs.every(
              (ref) => ref.sourceDocumentId === "source:1_page" && ref.documentIrId === "ir:1_page"
            )
          ) &&
          exercise.options.every((option) => option.sourceRefs.length > 0)
      )
    ).toBe(true);
    expect(
      exercises.every((exercise) => exercise.answerFields[0]?.reviewStatus === "needsReview")
    ).toBe(true);

    const refs = result.groups.flatMap((group) => [
      ...group.sourceRefs,
      ...(group.sharedResources ?? []).flatMap((resource) => [
        ...resource.sourceRefs,
        ...resource.entries.flatMap((entry) => entry.sourceRefs)
      ]),
      ...group.exercises.flatMap((exercise) => [
        ...exercise.sourceRefs,
        ...exercise.options.flatMap((option) => option.sourceRefs),
        ...exercise.answerFields.flatMap((field) => field.sourceRefs)
      ])
    ]);
    const blocks = new Map(document.blocks.map((block) => [block.id, block]));
    await expect(
      validateSourceLineage(refs, "source:1_page", "ir:1_page", {
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
