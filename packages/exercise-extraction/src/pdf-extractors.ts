import type {
  CoverageReport,
  DocumentIR,
  SourceBlock,
  SourceRef,
  ValidationIssue
} from "@lingua-bloom/contracts";

export type PdfInteractionKind =
  "singleChoice" | "wordOrder" | "bracketGap" | "oddOneOut" | "wordBankGap";

export interface ExtractedPdfOption {
  readonly id: string;
  readonly ordinal: number;
  readonly value: string;
  readonly sourceRefs: readonly SourceRef[];
}

export interface ExtractedPdfAnswerField {
  readonly id: string;
  readonly acceptedValues: readonly string[];
  readonly reviewStatus: "verified" | "needsReview";
  readonly provenance: "sourceKey" | "deterministicRule";
  readonly sourceRefs: readonly SourceRef[];
}

export interface ExtractedPdfExercise {
  readonly id: string;
  readonly groupOrdinal: number;
  readonly itemOrdinal: number;
  readonly prompt: string;
  readonly interactionKind: PdfInteractionKind;
  readonly sourceRefs: readonly SourceRef[];
  readonly options: readonly ExtractedPdfOption[];
  readonly answerFields: readonly ExtractedPdfAnswerField[];
}

export interface ExtractedPdfGroup {
  readonly id: string;
  readonly ordinal: number;
  readonly instruction: string;
  readonly interactionKind: PdfInteractionKind;
  readonly sourceRefs: readonly SourceRef[];
  readonly exercises: readonly ExtractedPdfExercise[];
}

export interface PdfExtractionResult {
  readonly groups: readonly ExtractedPdfGroup[];
  readonly issues: readonly ValidationIssue[];
  readonly coverage: CoverageReport;
}

export interface PdfExtractionInput {
  readonly documentIrId: string;
}

interface GroupSlice {
  readonly ordinal: number;
  instruction: string;
  readonly instructionBlocks: SourceBlock[];
  readonly blocks: readonly SourceBlock[];
}

const GROUP_KIND: Record<number, PdfInteractionKind> = {
  1: "singleChoice",
  2: "wordOrder",
  3: "bracketGap",
  4: "oddOneOut",
  5: "wordBankGap"
};

export function extractPdfExercises(
  document: DocumentIR,
  input: PdfExtractionInput
): PdfExtractionResult {
  const slices = sliceExerciseGroups(document.blocks);
  const groups = slices.flatMap((slice) => {
    const interactionKind = GROUP_KIND[slice.ordinal];
    if (!interactionKind) return [];
    const exercises = extractGroupExercises(document, input.documentIrId, slice, interactionKind);
    return [
      {
        id: `group:${String(slice.ordinal)}`,
        ordinal: slice.ordinal,
        instruction: stripLeadingNumber(slice.instruction),
        interactionKind,
        sourceRefs: slice.instructionBlocks.map((block) =>
          makeSourceRef(document, input.documentIrId, block)
        ),
        exercises
      }
    ];
  });
  const exercises = groups.flatMap((group) => group.exercises);
  const issues = exercises.flatMap((exercise) =>
    exercise.answerFields
      .filter((field) => field.reviewStatus === "needsReview")
      .map((field): ValidationIssue => ({
        id: `issue:${field.id}:unverified`,
        code: "ANSWER_UNVERIFIED",
        severity: "blocking",
        entityIds: [field.id],
        evidence: [...field.sourceRefs],
        message: "The source has no verified answer key for this answer field",
        resolution: "open"
      }))
  );
  return {
    groups,
    issues,
    coverage: {
      entries: exercises.map((exercise) => ({
        candidateId: exercise.id,
        outcome: { kind: "exercise", exerciseIds: [exercise.id] }
      })),
      detectedCandidateCount: exercises.length,
      accountedCandidateCount: exercises.length,
      unsupportedAdditionCount: 0,
      status: issues.length > 0 ? "needsReview" : "passed"
    }
  };
}

function sliceExerciseGroups(blocks: readonly SourceBlock[]): GroupSlice[] {
  const slices: {
    ordinal: number;
    instruction: string;
    instructionBlocks: SourceBlock[];
    blocks: SourceBlock[];
  }[] = [];
  let current: (typeof slices)[number] | undefined;
  for (const block of [...blocks].sort((left, right) => left.order - right.order)) {
    const match = block.rawText.trim().match(/^([1-5])\s+(Choose|Put|Complete)\b/i);
    if (match?.[1]) {
      current = {
        ordinal: Number(match[1]),
        instruction: block.rawText.trim(),
        instructionBlocks: [block],
        blocks: []
      };
      slices.push(current);
      continue;
    }
    if (/^answer\s*key\b/i.test(block.rawText.trim())) current = undefined;
    else if (
      current &&
      current.blocks.length === 0 &&
      !/[.!?)]$/.test(current.instruction) &&
      !/^[1-9]\d*\s+/.test(block.rawText.trim())
    ) {
      current.instruction += ` ${block.rawText.trim()}`;
      current.instructionBlocks.push(block);
    } else current?.blocks.push(block);
  }
  return slices.sort((left, right) => left.ordinal - right.ordinal);
}

function extractGroupExercises(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice,
  kind: PdfInteractionKind
): ExtractedPdfExercise[] {
  switch (kind) {
    case "singleChoice":
      return extractSingleChoice(document, documentIrId, slice);
    case "wordOrder":
      return extractNumberedLines(document, documentIrId, slice, kind, (text) =>
        text.includes("/")
      );
    case "bracketGap":
      return extractBracketGaps(document, documentIrId, slice);
    case "oddOneOut":
      return extractOddOneOut(document, documentIrId, slice);
    case "wordBankGap":
      return extractWordBankGaps(document, documentIrId, slice);
  }
}

function extractSingleChoice(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice
): ExtractedPdfExercise[] {
  const exercises: ExtractedPdfExercise[] = [];
  for (let index = 0; index < slice.blocks.length; index += 1) {
    const promptBlock = slice.blocks[index];
    if (!promptBlock) continue;
    const promptMatch = promptBlock.rawText.trim().match(/^([1-9]\d*)\s+(.+_{3,}.*)$/);
    if (!promptMatch?.[1] || !promptMatch[2]) continue;
    const optionBlock = slice.blocks[index + 1];
    if (!optionBlock) continue;
    const options = parseLabeledOptions(
      document,
      documentIrId,
      optionBlock,
      Number(promptMatch[1])
    );
    if (options.length < 2) continue;
    exercises.push(
      createExercise(
        document,
        documentIrId,
        1,
        Number(promptMatch[1]),
        promptMatch[2],
        "singleChoice",
        promptBlock,
        options
      )
    );
    index += 1;
  }
  return exercises;
}

function parseLabeledOptions(
  document: DocumentIR,
  documentIrId: string,
  block: SourceBlock,
  itemOrdinal: number
): ExtractedPdfOption[] {
  const text = block.rawText.replace(/\t/g, " ").trim();
  const pattern = /(?:^|\s)([a-z])\s+(.+?)(?=\s+[a-z]\s+|$)/giu;
  return [...text.matchAll(pattern)].map((match, index) => {
    const label = match[1] ?? String(index + 1);
    const value = (match[2] ?? "").trim();
    return {
      id: `group:1:item:${String(itemOrdinal)}:option:${label}`,
      ordinal: index + 1,
      value,
      sourceRefs: [makeSourceRef(document, documentIrId, block, value)]
    };
  });
}

function extractNumberedLines(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice,
  kind: PdfInteractionKind,
  accepts: (text: string) => boolean
): ExtractedPdfExercise[] {
  return slice.blocks.flatMap((block) => {
    const match = block.rawText.trim().match(/^([1-9]\d*)\s+(.+)$/);
    if (!match?.[1] || !match[2] || !accepts(match[2])) return [];
    return [
      createExercise(
        document,
        documentIrId,
        slice.ordinal,
        Number(match[1]),
        match[2],
        kind,
        block,
        []
      )
    ];
  });
}

function extractBracketGaps(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice
): ExtractedPdfExercise[] {
  const exercises: ExtractedPdfExercise[] = [];
  for (const block of slice.blocks) {
    const matches = [...block.rawText.matchAll(/([1-9]\d*)\s*_{3,}\s*\(([^)]+)\)/g)];
    for (const match of matches) {
      const itemOrdinal = Number(match[1]);
      exercises.push(
        createExercise(
          document,
          documentIrId,
          slice.ordinal,
          itemOrdinal,
          `(${match[2]?.trim() ?? ""})`,
          "bracketGap",
          block,
          []
        )
      );
    }
  }
  return exercises;
}

function extractOddOneOut(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice
): ExtractedPdfExercise[] {
  return slice.blocks.flatMap((block) => {
    const columns = block.rawText.trim().split(/\t+/);
    const head = columns[0]?.match(/^([1-9]\d*)\s+(.+)$/);
    if (!head?.[1] || !head[2]) return [];
    const values = [head[2], ...columns.slice(1)].map((value) => value.trim()).filter(Boolean);
    if (values.length < 3) return [];
    const itemOrdinal = Number(head[1]);
    const options = values.map((value, index) => ({
      id: `group:4:item:${String(itemOrdinal)}:option:${String(index + 1)}`,
      ordinal: index + 1,
      value,
      sourceRefs: [makeSourceRef(document, documentIrId, block, value)]
    }));
    return [
      createExercise(
        document,
        documentIrId,
        slice.ordinal,
        itemOrdinal,
        values.join(" | "),
        "oddOneOut",
        block,
        options
      )
    ];
  });
}

function extractWordBankGaps(
  document: DocumentIR,
  documentIrId: string,
  slice: GroupSlice
): ExtractedPdfExercise[] {
  const firstItemIndex = slice.blocks.findIndex((block) =>
    /^[1-9]\d*\s+/.test(block.rawText.trim())
  );
  if (firstItemIndex < 0) return [];
  const bankBlocks = slice.blocks.slice(0, firstItemIndex);
  const bank = bankBlocks.flatMap((block) =>
    block.rawText
      .trim()
      .split(/\t+|\s{2,}/)
      .map((value) => ({ value: value.trim(), block }))
      .filter(({ value }) => value.length > 0 && !/^\/?\d+$/.test(value))
  );
  return slice.blocks.slice(firstItemIndex).flatMap((block) => {
    const match = block.rawText.trim().match(/^([1-9]\d*)\s+(.+_{3,}.*)$/);
    if (!match?.[1] || !match[2]) return [];
    const itemOrdinal = Number(match[1]);
    const options = bank.map(({ value, block: bankBlock }, index) => ({
      id: `group:5:item:${String(itemOrdinal)}:option:${String(index + 1)}`,
      ordinal: index + 1,
      value,
      sourceRefs: [makeSourceRef(document, documentIrId, bankBlock, value)]
    }));
    return [
      createExercise(
        document,
        documentIrId,
        slice.ordinal,
        itemOrdinal,
        match[2],
        "wordBankGap",
        block,
        options
      )
    ];
  });
}

function createExercise(
  document: DocumentIR,
  documentIrId: string,
  groupOrdinal: number,
  itemOrdinal: number,
  prompt: string,
  interactionKind: PdfInteractionKind,
  block: SourceBlock,
  options: readonly ExtractedPdfOption[]
): ExtractedPdfExercise {
  const id = `group:${String(groupOrdinal)}:item:${String(itemOrdinal)}`;
  const sourceRefs = [makeSourceRef(document, documentIrId, block, prompt)];
  return {
    id,
    groupOrdinal,
    itemOrdinal,
    prompt,
    interactionKind,
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
}

function makeSourceRef(
  document: DocumentIR,
  documentIrId: string,
  block: SourceBlock,
  fragment?: string
): SourceRef {
  const fragmentStart = fragment ? block.rawText.indexOf(fragment) : -1;
  const charStart = fragmentStart >= 0 ? fragmentStart : 0;
  const charEnd =
    fragmentStart >= 0 && fragment ? charStart + fragment.length : block.rawText.length;
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

function stripLeadingNumber(text: string): string {
  return text.trim().replace(/^[1-9]\d*\s+/, "");
}
