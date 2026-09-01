import type {
  CoverageReport,
  DocumentIR,
  SourceBlock,
  SourceRef,
  ValidationIssue
} from "@lingua-bloom/contracts";
import {
  classifyTextSections,
  mapNormalizedRangeToRaw,
  normalizeTextWithSpans
} from "@lingua-bloom/document-ingestion";

import { detectTextTruncation } from "./truncation-detector";
import type {
  ExtractedPdfAnswerField,
  ExtractedPdfExercise,
  ExtractedPdfGroup
} from "./pdf-extractors";
import { segmentUnknownCandidates } from "./pdf-extractors";
import type { UnknownExerciseCandidate } from "@lingua-bloom/contracts";

export interface ExtractedTextAnswerField extends ExtractedPdfAnswerField {
  readonly markerKind: "bracket" | "ellipsis";
  readonly sourceValue: string;
}

export interface ExtractedTextExercise extends Omit<ExtractedPdfExercise, "answerFields"> {
  readonly answerFields: readonly ExtractedTextAnswerField[];
}

export interface ExtractedTextGroup extends Omit<ExtractedPdfGroup, "exercises"> {
  readonly exercises: readonly ExtractedTextExercise[];
}

export interface TextExtractionResult {
  readonly groups: readonly ExtractedTextGroup[];
  readonly referenceBlocks?: undefined;
  readonly unknownCandidates?: readonly UnknownExerciseCandidate[];
  readonly issues: readonly ValidationIssue[];
  readonly coverage: CoverageReport;
}

export interface TextExtractionInput {
  readonly documentIrId: string;
}

interface ItemBoundary {
  readonly ordinal: number;
  readonly markerStart: number;
  readonly contentStart: number;
}

interface AnswerMarker {
  readonly start: number;
  readonly end: number;
  readonly markerKind: "bracket" | "ellipsis";
  readonly sourceValue: string;
}

export function extractTextExercises(
  document: DocumentIR,
  input: TextExtractionInput
): TextExtractionResult {
  const block = getSingleTextBlock(document);
  const normalized = normalizeTextWithSpans(block.rawText);
  const boundaries = findSequentialItemBoundaries(normalized.normalizedText);
  const firstBoundary = boundaries[0];
  if (!firstBoundary) return emptyResult(document, input.documentIrId);

  const sections = classifyTextSections(block.rawText);
  const instruction = sections
    .filter((section) => section.kind === "instruction")
    .map((section) => section.rawText.trim())
    .join(" ");
  const exercises = boundaries.map((boundary, index): ExtractedTextExercise => {
    const next = boundaries[index + 1];
    const itemEnd = next?.markerStart ?? normalized.normalizedText.length;
    const promptStart = skipWhitespace(normalized.normalizedText, boundary.contentStart);
    const promptEnd = trimEndOffset(normalized.normalizedText, itemEnd);
    const sourcePrompt = normalized.normalizedText.slice(promptStart, promptEnd);
    const itemId = `group:1:item:${String(boundary.ordinal)}`;
    const promptRef = makeTextRef(
      document,
      input.documentIrId,
      block,
      normalized,
      promptStart,
      promptEnd
    );
    const markers = findAnswerMarkers(normalized.normalizedText, promptStart, promptEnd);
    const prompt = markers.some((marker) => marker.markerKind === "ellipsis")
      ? sourcePrompt.replace(/\.{3,}/gu, "___")
      : sourcePrompt;
    return {
      id: itemId,
      groupOrdinal: 1,
      itemOrdinal: boundary.ordinal,
      prompt,
      interactionKind: "bracketGap",
      sourceRefs: [promptRef],
      options: [],
      answerFields: markers.map((marker, markerIndex) => ({
        id: `${itemId}:answer:${String(markerIndex + 1)}`,
        acceptedValues: [],
        reviewStatus: "needsReview",
        provenance: "deterministicRule",
        markerKind: marker.markerKind,
        sourceValue: marker.sourceValue,
        sourceRefs: [
          makeTextRef(document, input.documentIrId, block, normalized, marker.start, marker.end)
        ]
      }))
    };
  });

  const answerIssues = exercises.flatMap((exercise) =>
    exercise.answerFields.map((field): ValidationIssue => ({
      id: `issue:${field.id}:unverified`,
      code: "ANSWER_UNVERIFIED",
      severity: "blocking",
      entityIds: [field.id],
      evidence: [...field.sourceRefs],
      message: "The source has no verified answer key for this answer field",
      resolution: "open"
    }))
  );
  const lastExercise = exercises.at(-1);
  const truncation = lastExercise
    ? detectTextTruncation(lastExercise.prompt)
    : { truncated: false };
  const truncationIssues: ValidationIssue[] =
    truncation.truncated && lastExercise
      ? [
          {
            id: `issue:${lastExercise.id}:truncated`,
            code: "SOURCE_TRUNCATED",
            severity: "blocking",
            entityIds: [lastExercise.id],
            evidence: [...lastExercise.sourceRefs],
            message: "The final numbered item ends without a complete source boundary",
            resolution: "open"
          }
        ]
      : [];
  const issues = [...answerIssues, ...truncationIssues];
  const coverage: CoverageReport = {
    entries: exercises.map((exercise) => ({
      candidateId: exercise.id,
      outcome: { kind: "exercise", exerciseIds: [exercise.id] }
    })),
    detectedCandidateCount: exercises.length,
    accountedCandidateCount: exercises.length,
    unsupportedAdditionCount: 0,
    status: issues.length > 0 ? "needsReview" : "passed"
  };
  const groupRef = makeTextRef(
    document,
    input.documentIrId,
    block,
    normalized,
    0,
    firstBoundary.markerStart
  );
  return {
    groups: [
      {
        id: "group:1",
        ordinal: 1,
        instruction: instruction || "Complete the exercise.",
        interactionKind: "bracketGap",
        sourceRefs: [groupRef],
        exercises
      }
    ],
    issues,
    coverage
  };
}

function findSequentialItemBoundaries(text: string): ItemBoundary[] {
  const matches = [...text.matchAll(/(?:^|\s)(\d{1,3})([.)])?(?=\s)/gu)];
  const result: ItemBoundary[] = [];
  let expected = 1;
  for (const match of matches) {
    const ordinal = Number(match[1]);
    if (ordinal !== expected) continue;
    const full = match[0];
    const leadingWhitespace = /^\s/u.test(full) ? 1 : 0;
    const markerStart = match.index + leadingWhitespace;
    result.push({
      ordinal,
      markerStart,
      contentStart: markerStart + String(ordinal).length + (match[2]?.length ?? 0)
    });
    expected += 1;
  }
  return result;
}

function findAnswerMarkers(text: string, start: number, end: number): AnswerMarker[] {
  const slice = text.slice(start, end);
  const bracketMarkers: AnswerMarker[] = [];
  for (const match of slice.matchAll(/\(([^)]+)\)/gu)) {
    const sourceValue = match[1];
    if (!sourceValue) continue;
    const relativeStart = match.index;
    bracketMarkers.push({
      start: start + relativeStart,
      end: start + relativeStart + match[0].length,
      markerKind: "bracket",
      sourceValue: sourceValue.trim()
    });
  }
  if (bracketMarkers.length > 0) {
    return bracketMarkers.sort((left, right) => left.start - right.start);
  }

  return [...slice.matchAll(/\.{3,}/gu)].map((match) => ({
    start: start + match.index,
    end: start + match.index + match[0].length,
    markerKind: "ellipsis" as const,
    sourceValue: match[0]
  }));
}

function makeTextRef(
  document: DocumentIR,
  documentIrId: string,
  block: SourceBlock,
  normalized: ReturnType<typeof normalizeTextWithSpans>,
  normalizedStart: number,
  normalizedEnd: number
): SourceRef {
  const raw = mapNormalizedRangeToRaw(normalized, normalizedStart, normalizedEnd);
  return {
    sourceDocumentId: document.sourceDocumentId,
    documentIrId,
    blockId: block.id,
    charStart: raw.rawStart,
    charEnd: raw.rawEnd,
    pageIndex: null,
    bbox: null
  };
}

function getSingleTextBlock(document: DocumentIR): SourceBlock {
  const blocks = [...document.blocks].sort((left, right) => left.order - right.order);
  const block = blocks[0];
  if (!block || blocks.length !== 1 || block.pageIndex != null) {
    throw new Error("Text extraction requires one raw-preserving logical text block");
  }
  return block;
}

function skipWhitespace(text: string, offset: number): number {
  let result = offset;
  while (result < text.length && /\s/u.test(text[result] ?? "")) result += 1;
  return result;
}

function trimEndOffset(text: string, offset: number): number {
  let result = offset;
  while (result > 0 && /\s/u.test(text[result - 1] ?? "")) result -= 1;
  return result;
}

function emptyResult(document: DocumentIR, documentIrId: string): TextExtractionResult {
  const unknownCandidates = segmentUnknownCandidates(document, documentIrId);
  return {
    groups: [],
    ...(unknownCandidates.length > 0 ? { unknownCandidates } : {}),
    issues: [],
    coverage: {
      entries: [],
      detectedCandidateCount: unknownCandidates.length,
      accountedCandidateCount: 0,
      unsupportedAdditionCount: 0,
      status: unknownCandidates.length > 0 ? "needsReview" : "passed"
    }
  };
}
