import type { DocumentIR, SourceBlock, SourceRef, ValidationIssue } from "@lingua-bloom/contracts";

import type {
  ExtractedPdfAnswerField,
  ExtractedPdfGroup,
  ExtractedPdfOption,
  ExtractedPdfReferenceBlock,
  PdfExtractionInput,
  PdfExtractionResult
} from "./pdf-extractors";

const READING_TITLE = /^Language school students$/i;
const CHOICE_READING_TITLE = /^My favourite place$/i;
const GAP_HEADING = /^5 Read the text again\. Complete the sentences using ONE WORD from$/i;
const CHOICE_HEADING = /^6 Read the text\. Circle the correct answers \(A or B\)\.$/i;

export function isReadingComprehensionDocument(document: DocumentIR) {
  return (
    document.blocks.some((block) => READING_TITLE.test(block.rawText.trim())) &&
    document.blocks.some((block) => GAP_HEADING.test(block.rawText.trim())) &&
    document.blocks.some((block) => CHOICE_HEADING.test(block.rawText.trim()))
  );
}

export function extractReadingComprehensionPdf(
  document: DocumentIR,
  input: PdfExtractionInput
): PdfExtractionResult {
  const readingBlocks = document.blocks
    .filter((block) => block.pageIndex === 0)
    .filter((block) => block.order >= findBlock(document, READING_TITLE).order)
    .filter((block) => !isBoilerplate(block.rawText));
  const gapHeading = findBlock(document, GAP_HEADING);
  const gapInstructionBlocks = [
    gapHeading,
    ...document.blocks.filter(
      (block) => block.pageIndex === gapHeading.pageIndex && block.rawText.trim() === "the text."
    )
  ].sort((left, right) => left.order - right.order);
  const gapQuestionBlocks = numberedQuestionBlocks(document, 1, /_{3,}/);
  const choiceHeading = findBlock(document, CHOICE_HEADING);
  const choiceQuestionBlocks = numberedQuestionBlocks(document, 2, /\?$/);
  const choiceReadingTitles = document.blocks.filter((block) =>
    CHOICE_READING_TITLE.test(block.rawText.trim())
  );
  const choiceReadingTitle = choiceReadingTitles.length === 1 ? choiceReadingTitles[0] : undefined;
  const choiceReadingBlocks = choiceReadingTitle
    ? document.blocks
        .filter((block) => block.pageIndex === choiceReadingTitle.pageIndex)
        .filter((block) => block.order >= choiceReadingTitle.order)
        .filter((block) => !isBoilerplate(block.rawText))
    : [];

  const groups: ExtractedPdfGroup[] = [
    buildGapGroup(
      document,
      input.documentIrId,
      readingBlocks,
      gapInstructionBlocks,
      gapQuestionBlocks
    ),
    buildChoiceGroup(
      document,
      input.documentIrId,
      choiceHeading,
      choiceQuestionBlocks,
      choiceReadingBlocks
    )
  ];
  const exercises = groups.flatMap((group) => group.exercises);
  const partialGroup = groups[1];
  if (!partialGroup) throw new Error("Reading comprehension choice group is missing");
  const issues: ValidationIssue[] = [
    ...(choiceReadingTitles.length === 0
      ? [
          {
            id: `issue:${partialGroup.id}:source-truncated`,
            code: "SOURCE_TRUNCATED" as const,
            severity: "blocking" as const,
            entityIds: [partialGroup.id, ...partialGroup.exercises.map((exercise) => exercise.id)],
            evidence: [...partialGroup.sourceRefs],
            message:
              "The questions refer to a reading passage that is absent from the supplied PDF pages",
            resolution: "open" as const
          }
        ]
      : []),
    ...(choiceReadingTitles.length > 1
      ? [
          {
            id: `issue:${partialGroup.id}:reading-passage-ambiguous`,
            code: "READING_ORDER_UNCERTAIN" as const,
            severity: "blocking" as const,
            entityIds: [partialGroup.id, ...partialGroup.exercises.map((exercise) => exercise.id)],
            evidence: choiceReadingTitles.map((block) =>
              makeSourceRef(document, input.documentIrId, block)
            ),
            message:
              "Multiple compatible reading passages were found; deterministic association is ambiguous",
            resolution: "open" as const
          }
        ]
      : []),
    ...exercises.flatMap((exercise) =>
      exercise.answerFields.map((field): ValidationIssue => ({
        id: `issue:${field.id}:unverified`,
        code: field.id === "group:5:item:3:answer:1" ? "ANSWER_AMBIGUOUS" : "ANSWER_UNVERIFIED",
        severity: "blocking",
        entityIds: [field.id],
        evidence: [...field.sourceRefs],
        message:
          field.id === "group:5:item:3:answer:1"
            ? "The source sentence is grammatically inconsistent; keep the answer empty for teacher resolution"
            : "The source has no verified answer key for this answer field",
        resolution: "open"
      }))
    )
  ];

  return {
    groups,
    referenceBlocks: [
      buildReadingReference(
        document,
        input.documentIrId,
        readingBlocks,
        "reference:reading-text",
        1
      ),
      ...(choiceReadingBlocks.length > 0
        ? [
            buildReadingReference(
              document,
              input.documentIrId,
              choiceReadingBlocks,
              "reference:choice-reading-text",
              2
            )
          ]
        : [])
    ],
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

function buildGapGroup(
  document: DocumentIR,
  documentIrId: string,
  readingBlocks: readonly SourceBlock[],
  instructionBlocks: readonly SourceBlock[],
  questionBlocks: readonly SourceBlock[]
): ExtractedPdfGroup {
  const readingRefs = readingBlocks.map((block) => makeSourceRef(document, documentIrId, block));
  return {
    id: "group:5",
    ordinal: 5,
    sourceOrder: instructionBlocks[0]?.order ?? 0,
    completeness: "complete",
    instruction: instructionBlocks
      .map((block) => block.rawText.trim())
      .join(" ")
      .replace(/^5\s+/, ""),
    interactionKind: "inlineGap",
    sourceRefs: instructionBlocks.map((block) => makeSourceRef(document, documentIrId, block)),
    exercises: questionBlocks.map((block) => {
      const match = block.rawText.trim().match(/^([1-9]\d*)\s+(.+)$/);
      if (!match?.[1] || !match[2]) throw new Error("Invalid reading gap question");
      const itemOrdinal = Number(match[1]);
      const id = `group:5:item:${String(itemOrdinal)}`;
      const gapStart = block.rawText.indexOf("_");
      const gapEnd = gapStart + (block.rawText.slice(gapStart).match(/^_+/)?.[0].length ?? 0);
      const answerRef = makeSourceRef(document, documentIrId, block, gapStart, gapEnd);
      const answerFields: ExtractedPdfAnswerField[] = [
        {
          id: `${id}:answer:1`,
          acceptedValues: [],
          reviewStatus: "needsReview",
          provenance: "deterministicRule",
          sourceRefs: [answerRef]
        }
      ];
      return {
        id,
        groupOrdinal: 5,
        itemOrdinal,
        prompt: match[2],
        interactionKind: "inlineGap",
        sourceRefs: [makeSourceRef(document, documentIrId, block), ...readingRefs],
        options: [],
        answerFields
      };
    })
  };
}

function buildChoiceGroup(
  document: DocumentIR,
  documentIrId: string,
  heading: SourceBlock,
  questionBlocks: readonly SourceBlock[],
  readingBlocks: readonly SourceBlock[]
): ExtractedPdfGroup {
  const readingRefs = readingBlocks.map((block) => makeSourceRef(document, documentIrId, block));
  return {
    id: "group:6",
    ordinal: 6,
    sourceOrder: heading.order,
    completeness: readingBlocks.length > 0 ? "complete" : "partial",
    ...(readingBlocks.length > 0 ? {} : { missingBoundary: "start" as const }),
    instruction: heading.rawText.trim().replace(/^6\s+/, ""),
    interactionKind: "singleChoice",
    sourceRefs: [makeSourceRef(document, documentIrId, heading), ...readingRefs],
    exercises: questionBlocks.map((block, index) => {
      const match = block.rawText.trim().match(/^([1-9]\d*)\s+(.+)$/);
      if (!match?.[1] || !match[2]) throw new Error("Invalid reading choice question");
      const itemOrdinal = Number(match[1]);
      const id = `group:6:item:${String(itemOrdinal)}`;
      const nextY = questionBlocks[index + 1]?.bbox?.y ?? Number.POSITIVE_INFINITY;
      const optionBlocks = document.blocks
        .filter((candidate) => candidate.pageIndex === block.pageIndex)
        .filter((candidate) => /^[AB]\s+/.test(candidate.rawText.trim()))
        .filter(
          (candidate) =>
            (candidate.bbox?.y ?? Number.NEGATIVE_INFINITY) >
              (block.bbox?.y ?? Number.NEGATIVE_INFINITY) &&
            (candidate.bbox?.y ?? Number.POSITIVE_INFINITY) < nextY
        )
        .sort((left, right) => (left.bbox?.x ?? 0) - (right.bbox?.x ?? 0));
      const parsedOptions = optionBlocks.flatMap((optionBlock) =>
        [...optionBlock.rawText.matchAll(/(?:^|\t)([AB])\s+([^\t]+)/g)].map((optionMatch) => {
          const label = optionMatch[1];
          const value = optionMatch[2]?.trim();
          if (!label || !value) throw new Error("Invalid reading choice option");
          const charStart = optionBlock.rawText.indexOf(value, optionMatch.index);
          return {
            label,
            value,
            sourceRef: makeSourceRef(
              document,
              documentIrId,
              optionBlock,
              charStart,
              charStart + value.length
            )
          };
        })
      );
      const options: ExtractedPdfOption[] = parsedOptions
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((option, optionIndex) => ({
          id: `${id}:option:${option.label.toLowerCase()}`,
          ordinal: optionIndex + 1,
          value: option.value,
          sourceRefs: [option.sourceRef]
        }));
      const sourceRefs = [
        makeSourceRef(document, documentIrId, block),
        ...options.flatMap((option) => option.sourceRefs),
        ...readingRefs
      ];
      return {
        id,
        groupOrdinal: 6,
        itemOrdinal,
        prompt: match[2],
        interactionKind: "singleChoice",
        sourceRefs,
        options,
        answerFields: [
          {
            id: `${id}:answer:1`,
            acceptedValues: [],
            reviewStatus: "needsReview",
            provenance: "deterministicRule",
            sourceRefs
          }
        ]
      };
    })
  };
}

function buildReadingReference(
  document: DocumentIR,
  documentIrId: string,
  blocks: readonly SourceBlock[],
  id: string,
  ordinal: number
): ExtractedPdfReferenceBlock {
  return {
    id,
    ordinal,
    sourceOrder: blocks[0]?.order ?? 0,
    lines: blocks.map((block, index) => ({
      id: `${id}:line:${String(index + 1)}`,
      ordinal: index + 1,
      rawText: block.rawText,
      sourceRefs: [makeSourceRef(document, documentIrId, block)]
    }))
  };
}

function numberedQuestionBlocks(document: DocumentIR, pageIndex: number, contentPattern: RegExp) {
  return document.blocks
    .filter((block) => block.pageIndex === pageIndex)
    .filter((block) => /^[1-9]\d*\s+/.test(block.rawText.trim()))
    .filter((block) => contentPattern.test(block.rawText.trim()))
    .sort((left, right) => (left.bbox?.y ?? left.order) - (right.bbox?.y ?? right.order));
}

function findBlock(document: DocumentIR, pattern: RegExp) {
  const block = document.blocks.find((candidate) => pattern.test(candidate.rawText.trim()));
  if (!block) throw new Error(`Required reading-comprehension block is missing: ${pattern.source}`);
  return block;
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

function isBoilerplate(rawText: string) {
  const text = rawText.trim();
  return (
    /^A1$/.test(text) ||
    /^PROGRESS TEST 3 \| Version C$/i.test(text) ||
    /^© 2022 Pearson\s+PHOTOCOPIABLE$/i.test(text) ||
    /^\d+$/.test(text)
  );
}
