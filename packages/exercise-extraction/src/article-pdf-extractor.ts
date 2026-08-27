import type { DocumentIR, SourceBlock, SourceRef, ValidationIssue } from "@lingua-bloom/contracts";

import type {
  ExtractedPdfAnswerField,
  ExtractedPdfExercise,
  ExtractedPdfGroup,
  ExtractedPdfReferenceBlock,
  PdfExtractionInput,
  PdfExtractionResult
} from "./pdf-extractors";

const EXERCISE_HEADING = /^Упражнение\s+(\d+)\s*$/i;
const REFERENCE_HEADING = /^(Запомните|Обратите внимание)(?:\s|$)/i;
const INSTRUCTION = /^Вставьте артикль, где необходимо\.?$/i;

interface MutableGroup {
  ordinal: number;
  sourceOrder: number;
  instructionBlock?: SourceBlock;
  blocks: SourceBlock[];
  completeness: "complete" | "partial";
  missingBoundary?: "start" | "end" | "both";
}

export function isArticleInsertionDocument(document: DocumentIR) {
  return (
    document.blocks.some((block) => EXERCISE_HEADING.test(block.rawText.trim())) &&
    document.blocks.some((block) => INSTRUCTION.test(block.rawText.trim()))
  );
}

export function extractArticleInsertionPdf(
  document: DocumentIR,
  input: PdfExtractionInput
): PdfExtractionResult {
  const ordered = [...document.blocks]
    .sort((left, right) => left.order - right.order)
    .filter((block) => !isRunningHeaderOrFooter(block.rawText));
  const segmented = segmentDocument(ordered);
  repairCrossColumnContinuations(document, segmented.groups);
  const groups = segmented.groups.map((group) => buildGroup(document, input.documentIrId, group));
  const exercises = groups.flatMap((group) => group.exercises);
  const issues: ValidationIssue[] = [
    ...groups
      .filter((group) => group.completeness === "partial")
      .map((group) => ({
        id: `issue:${group.id}:source-truncated`,
        code: "SOURCE_TRUNCATED" as const,
        severity: "blocking" as const,
        entityIds: [group.id, ...group.exercises.map((exercise) => exercise.id)],
        evidence: [...group.sourceRefs],
        message:
          "The exercise begins outside the supplied pages and is kept in a separate partial group",
        resolution: "open" as const
      })),
    ...exercises.flatMap((exercise) =>
      exercise.answerFields.map((field) => ({
        id: `issue:${field.id}:unverified`,
        code: "ANSWER_UNVERIFIED" as const,
        severity: "blocking" as const,
        entityIds: [field.id],
        evidence: [...field.sourceRefs],
        message: "The source has no verified answer key for this answer field",
        resolution: "open" as const
      }))
    )
  ];

  return {
    groups,
    referenceBlocks: segmented.referenceBlocks.map((blocks, index): ExtractedPdfReferenceBlock => ({
      id: `reference:${String(index + 1)}`,
      ordinal: index + 1,
      sourceOrder: blocks[0]?.order ?? index,
      lines: blocks.map((block, lineIndex) => ({
        id: `reference:${String(index + 1)}:line:${String(lineIndex + 1)}`,
        ordinal: lineIndex + 1,
        rawText: block.rawText,
        sourceRefs: [makeSourceRef(document, input.documentIrId, block)]
      }))
    })),
    issues,
    coverage: {
      entries: exercises.map((exercise) => ({
        candidateId: exercise.id,
        outcome: { kind: "exercise" as const, exerciseIds: [exercise.id] }
      })),
      detectedCandidateCount: exercises.length,
      accountedCandidateCount: exercises.length,
      unsupportedAdditionCount: 0,
      status: "needsReview"
    }
  };
}

function segmentDocument(blocks: readonly SourceBlock[]) {
  const headings = blocks.flatMap((block) => {
    const match = block.rawText.trim().match(EXERCISE_HEADING);
    return match?.[1] ? [{ block, ordinal: Number(match[1]) }] : [];
  });
  const groups: MutableGroup[] = [];
  const first = headings[0];
  if (first) {
    const leading = blocks.filter((block) => block.order < first.block.order);
    if (leading.length > 0) {
      groups.push({
        ordinal: Math.max(1, first.ordinal - 1),
        sourceOrder: leading[0]?.order ?? 0,
        blocks: [...leading],
        completeness: "partial",
        missingBoundary: "start"
      });
    }
  }
  for (const heading of headings) {
    groups.push({
      ordinal: heading.ordinal,
      sourceOrder: heading.block.order,
      blocks: [],
      completeness: "complete"
    });
  }

  const referenceBlocks: SourceBlock[][] = [];
  let currentGroup: MutableGroup | undefined;
  let currentReference: SourceBlock[] | undefined;
  for (const block of blocks) {
    const heading = block.rawText.trim().match(EXERCISE_HEADING);
    if (heading?.[1]) {
      currentReference = undefined;
      currentGroup = groups.find(
        (group) => group.completeness === "complete" && group.ordinal === Number(heading[1])
      );
      continue;
    }
    if (REFERENCE_HEADING.test(block.rawText.trim())) {
      currentReference = [block];
      referenceBlocks.push(currentReference);
      continue;
    }
    if (currentReference) {
      currentReference.push(block);
      continue;
    }
    if (INSTRUCTION.test(block.rawText.trim())) {
      if (currentGroup) currentGroup.instructionBlock = block;
      continue;
    }
    currentGroup?.blocks.push(block);
  }

  return {
    groups: groups.filter((group) => group.blocks.length > 0),
    referenceBlocks
  };
}

function repairCrossColumnContinuations(document: DocumentIR, groups: MutableGroup[]) {
  for (let index = 1; index < groups.length; index += 1) {
    const current = groups[index];
    const previous = groups[index - 1];
    if (!current || !previous) continue;
    const pageIndex = current.blocks.find((block) => block.bbox != null)?.pageIndex;
    const page = document.pages.find((candidate) => candidate.index === pageIndex);
    if (!page) continue;
    const firstRightIndex = current.blocks.findIndex((block, blockIndex) => {
      const prior = current.blocks[blockIndex - 1];
      return (
        blockIndex > 0 &&
        block.pageIndex === pageIndex &&
        (block.bbox?.x ?? 0) > page.width / 2 &&
        (prior?.bbox?.x ?? page.width) < page.width / 2
      );
    });
    if (
      firstRightIndex < 0 ||
      !/^[A-Z]/.test(current.blocks[firstRightIndex]?.rawText.trim() ?? "")
    )
      continue;
    const continuationIndex = current.blocks.findIndex(
      (block, blockIndex) =>
        blockIndex > firstRightIndex &&
        /[.!?]\s*$/.test(current.blocks[blockIndex - 1]?.rawText.trim() ?? "") &&
        block.pageIndex === pageIndex &&
        (block.bbox?.x ?? 0) > page.width / 2 &&
        /^[a-z]/.test(block.rawText.trim())
    );
    if (continuationIndex > firstRightIndex) {
      previous.blocks.push(
        ...current.blocks.splice(firstRightIndex, continuationIndex - firstRightIndex)
      );
    }
  }
}

function buildGroup(
  document: DocumentIR,
  documentIrId: string,
  group: MutableGroup
): ExtractedPdfGroup {
  const source = group.instructionBlock ?? group.blocks[0];
  if (!source) throw new Error("Article group has no source block");
  return {
    id: `group:${String(group.ordinal)}`,
    ordinal: group.ordinal,
    sourceOrder: group.sourceOrder,
    completeness: group.completeness,
    ...(group.missingBoundary ? { missingBoundary: group.missingBoundary } : {}),
    instruction:
      group.instructionBlock?.rawText.trim() ??
      "Partial exercise from the previous page (source start is missing)",
    interactionKind: "inlineGap",
    sourceRefs: [makeSourceRef(document, documentIrId, source)],
    exercises: splitItems(document, documentIrId, group)
  };
}

function splitItems(
  document: DocumentIR,
  documentIrId: string,
  group: MutableGroup
): ExtractedPdfExercise[] {
  const pieces: { block: SourceBlock; start: number; end: number }[] = [];
  let fullText = "";
  for (const block of group.blocks.sort((left, right) => left.order - right.order)) {
    if (fullText) fullText += " ";
    const start = fullText.length;
    fullText += block.rawText.trim();
    pieces.push({ block, start, end: fullText.length });
  }
  const matches = [...fullText.matchAll(/(?:^|\s)(\d+)\.\s/g)];
  const ranges =
    matches.length > 0
      ? matches.map((match, index) => ({
          ordinal: Number(match[1]),
          start: match.index + match[0].length,
          end: matches[index + 1]?.index ?? fullText.length
        }))
      : [{ ordinal: 1, start: 0, end: fullText.length }];

  return ranges.map((range) => {
    const id = `group:${String(group.ordinal)}:item:${String(range.ordinal)}`;
    const involved = pieces.filter((piece) => piece.end > range.start && piece.start < range.end);
    let answerOrdinal = 0;
    const answerFields: ExtractedPdfAnswerField[] = [];
    for (const piece of involved) {
      for (const match of piece.block.rawText.matchAll(/\.\.\./g)) {
        const localStart = match.index;
        const globalStart = piece.start + localStart;
        if (globalStart < range.start || globalStart >= range.end) continue;
        answerOrdinal += 1;
        answerFields.push({
          id: `${id}:answer:${String(answerOrdinal)}`,
          acceptedValues: [],
          reviewStatus: "needsReview",
          provenance: "deterministicRule",
          sourceRefs: [
            makeSourceRef(
              document,
              documentIrId,
              piece.block,
              localStart,
              localStart + match[0].length
            )
          ]
        });
      }
    }
    return {
      id,
      groupOrdinal: group.ordinal,
      itemOrdinal: range.ordinal,
      prompt: fullText.slice(range.start, range.end).trim(),
      interactionKind: "inlineGap",
      sourceRefs: involved.map(({ block }) => makeSourceRef(document, documentIrId, block)),
      options: [],
      answerFields
    };
  });
}

function makeSourceRef(
  document: DocumentIR,
  documentIrId: string,
  block: SourceBlock,
  charStart = 0,
  charEnd = block.rawText.length
): SourceRef {
  return {
    sourceDocumentId: document.sourceDocumentId,
    documentIrId,
    blockId: block.id,
    charStart,
    charEnd,
    pageIndex: block.pageIndex ?? null,
    bbox: block.bbox ?? null
  };
}

function isRunningHeaderOrFooter(rawText: string) {
  const text = rawText.trim();
  return (
    /^Артикль\s+\d+$/i.test(text) || /^\d+\s+[_\s]*ГРАММАТИКА\.\s*СБОРНИК УПРАЖНЕНИЙ$/i.test(text)
  );
}
