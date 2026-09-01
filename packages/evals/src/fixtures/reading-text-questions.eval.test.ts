import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { ARTIFACT_VERSIONS } from "@lingua-bloom/domain";
import { extractPdfExercises, validateSourceLineage } from "@lingua-bloom/exercise-extraction";
import { describe, expect, test } from "vitest";

interface Golden {
  pdfParserVersion: string;
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
    interactionKind: string;
    itemCount: number;
    answerFieldCount: number;
    pages: readonly number[];
  }[];
  referenceBlocks: readonly (readonly string[])[];
  items: readonly {
    group: number;
    ordinal: number;
    prompt: string;
    options: readonly string[];
  }[];
  answerKey: readonly {
    group: number;
    ordinal: number;
    acceptedValues: readonly string[];
    modelSuggestionPolicy: "allowed" | "teacherOnly";
  }[];
}

describe("reading_text_questions_4_pages.pdf golden evaluation", () => {
  test("preserves both reading texts and links each complete question group", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/reading_text_questions_4_pages.pdf"))
    );
    const golden = JSON.parse(
      await readFile(
        resolve(root, "tests/golden/reading_text_questions_4_pages.expected.json"),
        "utf8"
      )
    ) as Golden;
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:reading_text_questions",
      sourceDocumentId: "source:reading_text_questions"
    });
    const result = extractPdfExercises(document, {
      documentIrId: "ir:reading_text_questions"
    });
    const exercises = result.groups.flatMap((group) => group.exercises);

    expect(ARTIFACT_VERSIONS.pdfParser).toBe(golden.pdfParserVersion);
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
    expect(result.groups.map((group) => group.interactionKind)).toEqual(
      golden.groups.map((group) => group.interactionKind)
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
    expect(
      exercises.map((exercise) => ({
        group: exercise.groupOrdinal,
        ordinal: exercise.itemOrdinal,
        prompt: exercise.prompt,
        options: exercise.options.map((option) => option.value)
      }))
    ).toEqual(golden.items);
    expect(exercises.some((exercise) => exercise.itemOrdinal === 0)).toBe(false);
    expect(result.groups[1]).toMatchObject({ completeness: "complete" });
    expect(
      result.issues.some(
        (issue) => issue.code === "SOURCE_TRUNCATED" && issue.entityIds.includes("group:6")
      )
    ).toBe(false);
    expect(
      result.groups[0]?.exercises.every((exercise) =>
        exercise.sourceRefs.some((ref) => ref.pageIndex === 0)
      )
    ).toBe(true);
    expect(
      result.groups[1]?.exercises.every((exercise) =>
        exercise.sourceRefs.some((ref) => ref.pageIndex === 3)
      )
    ).toBe(true);

    const ambiguousAnswer = golden.answerKey.find(
      (answer) => answer.group === 5 && answer.ordinal === 3
    );
    expect(ambiguousAnswer).toEqual({
      group: 5,
      ordinal: 3,
      acceptedValues: [],
      modelSuggestionPolicy: "teacherOnly"
    });
    expect(
      golden.answerKey
        .filter((answer) => answer.modelSuggestionPolicy === "allowed")
        .every((answer) => answer.acceptedValues.length > 0)
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.code === "ANSWER_AMBIGUOUS" && issue.entityIds.includes("group:5:item:3:answer:1")
      )
    ).toBe(true);

    const refs = [
      ...result.groups.flatMap((group) => [
        ...group.sourceRefs,
        ...group.exercises.flatMap((exercise) => [
          ...exercise.sourceRefs,
          ...exercise.options.flatMap((option) => option.sourceRefs),
          ...exercise.answerFields.flatMap((field) => field.sourceRefs)
        ])
      ]),
      ...(result.referenceBlocks ?? []).flatMap((block) =>
        block.lines.flatMap((line) => line.sourceRefs)
      )
    ];
    const blocks = new Map(document.blocks.map((block) => [block.id, block]));
    await expect(
      validateSourceLineage(refs, "source:reading_text_questions", "ir:reading_text_questions", {
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

  test("marks questions partial and blocking when their reading passage is absent", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/reading_text_questions_4_pages.pdf"))
    );
    const completeDocument = await buildPdfDocumentIr(bytes, {
      id: "ir:reading_text_questions_missing_passage",
      sourceDocumentId: "source:reading_text_questions_missing_passage"
    });
    const document = {
      ...completeDocument,
      pages: completeDocument.pages.slice(0, 3),
      blocks: completeDocument.blocks.filter((block) => block.pageIndex !== 3)
    };
    const result = extractPdfExercises(document, {
      documentIrId: "ir:reading_text_questions_missing_passage"
    });
    const choiceGroup = result.groups.find((group) => group.id === "group:6");
    const truncationIssue = result.issues.find(
      (issue) => issue.code === "SOURCE_TRUNCATED" && issue.entityIds.includes("group:6")
    );

    expect(document.pages).toHaveLength(3);
    expect(choiceGroup).toMatchObject({
      completeness: "partial",
      missingBoundary: "start"
    });
    expect(truncationIssue).toMatchObject({
      severity: "blocking",
      resolution: "open"
    });
    expect(truncationIssue?.entityIds).toEqual([
      "group:6",
      ...(choiceGroup?.exercises.map((exercise) => exercise.id) ?? [])
    ]);
    expect(result.referenceBlocks).toHaveLength(1);
    expect(
      choiceGroup?.exercises.every((exercise) =>
        exercise.sourceRefs.every((ref) => ref.pageIndex !== 3)
      )
    ).toBe(true);
  });

  test("does not choose arbitrarily when multiple compatible passages exist", async () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/reading_text_questions_4_pages.pdf"))
    );
    const document = await buildPdfDocumentIr(bytes, {
      id: "ir:reading_text_questions_ambiguous",
      sourceDocumentId: "source:reading_text_questions_ambiguous"
    });
    const passageTitle = document.blocks.find(
      (block) => block.rawText.trim() === "My favourite place"
    );
    if (!passageTitle) throw new Error("Reading passage title is missing from the fixture");
    const ambiguousDocument = {
      ...document,
      blocks: [
        ...document.blocks,
        {
          ...passageTitle,
          id: "block:duplicate-reading-title",
          order: Math.max(...document.blocks.map((block) => block.order)) + 1
        }
      ]
    };
    const result = extractPdfExercises(ambiguousDocument, {
      documentIrId: "ir:reading_text_questions_ambiguous"
    });

    expect(result.groups.find((group) => group.id === "group:6")).toMatchObject({
      completeness: "partial",
      missingBoundary: "start"
    });
    const ambiguityIssue = result.issues.find((issue) => issue.code === "READING_ORDER_UNCERTAIN");
    expect(ambiguityIssue).toMatchObject({
      severity: "blocking",
      resolution: "open"
    });
    expect(ambiguityIssue?.entityIds).toContain("group:6");
    expect(result.referenceBlocks).toHaveLength(1);
  });
});
