import {
  STRUCTURE_V2_PROFILE,
  StructuralClassificationRequestSchema,
  type StructuralClassificationRequest,
  type DocumentIR,
  type SourceBlock
} from "@lingua-bloom/contracts";

export interface StructuralWindow {
  readonly id: string;
  readonly ordinal: number;
  readonly documentIrId: string;
  readonly blockIds: readonly string[];
  readonly blocks: readonly SourceBlock[];
  readonly overlapBefore: readonly string[];
  readonly overlapAfter: readonly string[];
  readonly estimatedInputTokens: number;
}

export interface StructuralWindowProfile {
  readonly version: string;
  readonly maxBlocksPerWindow: number;
  readonly maxEstimatedInputTokens: number;
  readonly overlapBlocks: number;
}

export function estimateStructuralInputTokens(block: SourceBlock): number {
  return Math.max(1, Array.from(block.rawText).length);
}

export function planStructuralWindows(
  document: DocumentIR,
  profile: StructuralWindowProfile = STRUCTURE_V2_PROFILE
): StructuralWindow[] {
  validateProfile(profile);
  const documentIrId = document.id ?? document.sourceDocumentId;
  const blocks = [...document.blocks]
    .filter((block) => block.rawText.trim().length > 0)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    throw new Error("DocumentIR block IDs must be unique");
  }
  const oversized = blocks.find(
    (block) => estimateStructuralInputTokens(block) > profile.maxEstimatedInputTokens
  );
  if (oversized) {
    throw new RangeError(
      `DocumentIR block ${oversized.id} exceeds the structural window token limit`
    );
  }
  const provisional: { blocks: SourceBlock[]; tokens: number }[] = [];

  let start = 0;
  while (start < blocks.length) {
    let end = start;
    let tokens = 0;
    while (end < blocks.length && end - start < profile.maxBlocksPerWindow) {
      const block = blocks[end];
      if (!block) break;
      const blockTokens = estimateStructuralInputTokens(block);
      if (end > start && tokens + blockTokens > profile.maxEstimatedInputTokens) break;
      tokens += blockTokens;
      end += 1;
    }
    if (end === start) {
      const block = blocks[start];
      if (!block) break;
      end += 1;
      tokens = estimateStructuralInputTokens(block);
    }
    const windowBlocks = blocks.slice(start, end);
    provisional.push({ blocks: windowBlocks, tokens });
    if (end >= blocks.length) break;
    const overlap = Math.min(profile.overlapBlocks, Math.max(0, windowBlocks.length - 1));
    start = Math.max(start + 1, end - overlap);
  }

  return provisional.map((window, ordinal) => {
    const previousIds = new Set(provisional[ordinal - 1]?.blocks.map((block) => block.id) ?? []);
    const nextIds = new Set(provisional[ordinal + 1]?.blocks.map((block) => block.id) ?? []);
    const blockIds = window.blocks.map((block) => block.id);
    return {
      id: `${documentIrId}:window:${String(ordinal)}:${blockIds[0] ?? "empty"}:${blockIds.at(-1) ?? "empty"}`,
      ordinal,
      documentIrId,
      blockIds,
      blocks: window.blocks,
      overlapBefore: blockIds.filter((id) => previousIds.has(id)),
      overlapAfter: blockIds.filter((id) => nextIds.has(id)),
      estimatedInputTokens: window.tokens
    };
  });
}

export function buildStructuralClassificationRequest(
  window: StructuralWindow,
  modelId: string
): StructuralClassificationRequest {
  return StructuralClassificationRequestSchema.parse({
    kind: "structuralClassificationRequest",
    schemaVersion: "1.0.0",
    documentIrId: window.documentIrId,
    windowId: window.id,
    windowOrdinal: window.ordinal,
    profileVersion: STRUCTURE_V2_PROFILE.version,
    promptVersion: STRUCTURE_V2_PROFILE.promptVersion,
    modelId,
    inputVersion: STRUCTURE_V2_PROFILE.requestSchemaVersion,
    outputVersion: STRUCTURE_V2_PROFILE.outputSchemaVersion,
    blocks: window.blocks.map((block) => ({
      id: block.id,
      ordinal: block.order,
      rawText: block.rawText,
      pageIndex: block.pageIndex ?? null,
      bbox: block.bbox ?? null,
      style: null
    })),
    overlapBefore: window.overlapBefore,
    overlapAfter: window.overlapAfter
  });
}

function validateProfile(profile: StructuralWindowProfile): void {
  if (!Number.isInteger(profile.maxBlocksPerWindow) || profile.maxBlocksPerWindow < 1) {
    throw new RangeError("maxBlocksPerWindow must be a positive integer");
  }
  if (!Number.isInteger(profile.maxEstimatedInputTokens) || profile.maxEstimatedInputTokens < 1) {
    throw new RangeError("maxEstimatedInputTokens must be a positive integer");
  }
  if (
    !Number.isInteger(profile.overlapBlocks) ||
    profile.overlapBlocks < 0 ||
    profile.overlapBlocks >= profile.maxBlocksPerWindow
  ) {
    throw new RangeError("overlapBlocks must be non-negative and smaller than the window size");
  }
}
