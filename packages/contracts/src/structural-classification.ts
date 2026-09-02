import { z } from "zod";

import { BBoxSchema, IdSchema } from "./document-ir";

export const STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION = "1.0.0";
export const STRUCTURAL_CLASSIFICATION_PROMPT_VERSION = "structural-classifier-v2";
export const RECONCILED_STRUCTURE_SCHEMA_VERSION = "1.1.0";
export const LEGACY_RECONCILED_STRUCTURE_SCHEMA_VERSION = "1.0.0";
export const LEGACY_STRUCTURE_PROFILE_VERSION = "structure-v1";
export const STRUCTURE_V2_PROFILE = {
  version: "structure-v2",
  requestSchemaVersion: STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION,
  outputSchemaVersion: STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION,
  promptVersion: STRUCTURAL_CLASSIFICATION_PROMPT_VERSION,
  maxBlocksPerWindow: 64,
  maxEstimatedInputTokens: 12_000,
  overlapBlocks: 8,
  confidenceThreshold: 0.8,
  timeoutMs: 45_000,
  maxAttempts: 2,
  maxConcurrentWindows: 3
} as const;

export const StructuralSemanticRoleSchema = z.enum([
  "sectionHeading",
  "instruction",
  "referenceMaterial",
  "example",
  "exercisePrompt",
  "gapSegment",
  "localOption",
  "sharedBankEntry",
  "answerKey",
  "boilerplate",
  "unknown"
]);

export const StructuralInteractionKindSchema = z.enum([
  "singleChoice",
  "wordOrder",
  "bracketGap",
  "oddOneOut",
  "wordBankGap",
  "inlineGap",
  "shortText",
  "imageChoice",
  "matching",
  "unknown"
]);

export const StructuralBlockRefSchema = z
  .object({
    blockId: IdSchema,
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().positive().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.charStart == null) !== (value.charEnd == null)) {
      context.addIssue({
        code: "custom",
        message: "charStart and charEnd must be supplied together"
      });
    }
    if (value.charStart != null && value.charEnd != null && value.charEnd <= value.charStart) {
      context.addIssue({ code: "custom", message: "charEnd must be greater than charStart" });
    }
  });

export const StructuralInputBlockSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().nonnegative(),
    rawText: z.string(),
    pageIndex: z.number().int().nonnegative().nullable(),
    bbox: BBoxSchema.nullable(),
    style: z.record(z.string(), z.unknown()).nullable()
  })
  .strict();

export const StructuralClassificationRequestSchema = z
  .object({
    kind: z.literal("structuralClassificationRequest"),
    schemaVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    documentIrId: IdSchema,
    windowId: IdSchema,
    windowOrdinal: z.number().int().nonnegative(),
    profileVersion: z.literal(STRUCTURE_V2_PROFILE.version),
    promptVersion: z.literal(STRUCTURAL_CLASSIFICATION_PROMPT_VERSION),
    modelId: IdSchema,
    inputVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    outputVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    blocks: z.array(StructuralInputBlockSchema).min(1).max(STRUCTURE_V2_PROFILE.maxBlocksPerWindow),
    overlapBefore: z.array(IdSchema).max(STRUCTURE_V2_PROFILE.overlapBlocks),
    overlapAfter: z.array(IdSchema).max(STRUCTURE_V2_PROFILE.overlapBlocks)
  })
  .strict();

export const StructuralRegionSchema = z
  .object({
    id: IdSchema,
    role: StructuralSemanticRoleSchema,
    source: z.array(StructuralBlockRefSchema).min(1),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1))
  })
  .strict();

export const StructuralGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    regionIds: z.array(IdSchema),
    exerciseIds: z.array(IdSchema).min(1),
    sharedResourceIds: z.array(IdSchema),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const StructuralExerciseSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    sourceOrdinal: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
    interactionKind: StructuralInteractionKindSchema,
    promptRegionIds: z.array(IdSchema).min(1),
    gapRegionIds: z.array(IdSchema),
    optionRegionIds: z.array(IdSchema),
    sharedResourceIds: z.array(IdSchema),
    answerFieldCount: z.number().int().positive(),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const StructuralSharedResourceSchema = z
  .object({
    id: IdSchema,
    kind: z.enum(["wordBank", "matchingBank"]),
    entryRegionIds: z.array(IdSchema).min(1),
    usagePolicy: z.enum(["useOnce", "reusable", "unspecified"]),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const StructuralCoverageClaimSchema = z
  .object({
    blockId: IdSchema,
    outcome: z.enum([
      "exerciseComponent",
      "reference",
      "example",
      "answerKey",
      "boilerplate",
      "unknown"
    ]),
    regionIds: z.array(IdSchema).min(1)
  })
  .strict();

export const StructuralClassificationProposalSchema = z
  .object({
    kind: z.literal("structuralClassificationProposal"),
    schemaVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    proposalId: IdSchema,
    documentIrId: IdSchema,
    windowId: IdSchema,
    profileVersion: z.literal(STRUCTURE_V2_PROFILE.version),
    promptVersion: z.literal(STRUCTURAL_CLASSIFICATION_PROMPT_VERSION),
    modelId: IdSchema,
    inputVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    outputVersion: z.literal(STRUCTURAL_CLASSIFICATION_SCHEMA_VERSION),
    regions: z.array(StructuralRegionSchema),
    groups: z.array(StructuralGroupSchema),
    exercises: z.array(StructuralExerciseSchema),
    sharedResources: z.array(StructuralSharedResourceSchema),
    coverageClaims: z.array(StructuralCoverageClaimSchema)
  })
  .strict();

export const StructuralModelCallManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: IdSchema,
    runId: IdSchema,
    documentIrId: IdSchema,
    windowId: IdSchema,
    modelId: IdSchema,
    promptVersion: IdSchema,
    inputVersion: IdSchema,
    outputVersion: IdSchema,
    profileVersion: IdSchema,
    attempt: z.number().int().positive().max(STRUCTURE_V2_PROFILE.maxAttempts),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().nonnegative(),
    outcome: z.enum([
      "succeeded",
      "timeout",
      "rateLimited",
      "authFailed",
      "paymentRequired",
      "invalidOutput",
      "providerFailed"
    ]),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cost: z.number().nonnegative().nullable(),
    currency: z.string().min(1).nullable(),
    costUnavailable: z.boolean(),
    aggregateCounts: z.record(z.string(), z.number().int().nonnegative())
  })
  .strict()
  .superRefine((value, context) => {
    if (value.costUnavailable === (value.cost != null)) {
      context.addIssue({
        code: "custom",
        message: "costUnavailable must be false exactly when provider cost is present"
      });
    }
    if (value.cost != null && value.currency == null) {
      context.addIssue({ code: "custom", message: "reported cost requires currency" });
    }
  });

export const StructuralConflictSchema = z
  .object({
    id: IdSchema,
    code: z.enum([
      "OVERLAPPING_OWNERSHIP",
      "INCOMPATIBLE_CONTINUATION",
      "DANGLING_RELATION",
      "ORDER_CONFLICT",
      "MISSING_BLOCK",
      "INVALID_INTERACTION",
      "NON_ATOMIC_EXERCISE",
      "MIXED_INSTRUCTION_AND_ITEMS",
      "LOW_CONFIDENCE",
      "UNKNOWN_STRUCTURE"
    ]),
    blockIds: z.array(IdSchema).min(1),
    proposalIds: z.array(IdSchema).min(1),
    resolution: z.enum(["open", "resolvedByIdentity", "teacherResolved"])
  })
  .strict();

export const StructuralCoverageOutcomeSchema = z
  .object({
    blockId: IdSchema,
    kind: z.enum([
      "exerciseComponent",
      "reference",
      "example",
      "answerKey",
      "boilerplate",
      "teacherExclusion",
      "issue"
    ]),
    entityIds: z.array(IdSchema).min(1)
  })
  .strict();

export const LegacyStructuralConflictSchema = z
  .object({
    id: IdSchema,
    code: z.enum([
      "OVERLAPPING_OWNERSHIP",
      "INCOMPATIBLE_CONTINUATION",
      "DANGLING_RELATION",
      "ORDER_CONFLICT",
      "MISSING_BLOCK",
      "INVALID_INTERACTION",
      "LOW_CONFIDENCE",
      "UNKNOWN_STRUCTURE"
    ]),
    blockIds: z.array(IdSchema).min(1),
    proposalIds: z.array(IdSchema).min(1),
    resolution: z.enum(["open", "resolvedByIdentity", "teacherResolved"])
  })
  .strict();

const ReconciledStructureFields = {
  documentIrId: IdSchema,
  proposalIds: z.array(IdSchema).min(1),
  regions: z.array(StructuralRegionSchema),
  groups: z.array(StructuralGroupSchema),
  exercises: z.array(StructuralExerciseSchema),
  sharedResources: z.array(StructuralSharedResourceSchema),
  coverage: z
    .object({
      significantBlockCount: z.number().int().nonnegative(),
      accountedBlockCount: z.number().int().nonnegative(),
      outcomes: z.array(StructuralCoverageOutcomeSchema)
    })
    .strict(),
  validationStatus: z.enum(["valid", "needsReview", "blocked"])
} as const;

export const ReconciledStructureV1Schema = z
  .object({
    schemaVersion: z.literal(LEGACY_RECONCILED_STRUCTURE_SCHEMA_VERSION),
    ...ReconciledStructureFields,
    profileVersion: z.literal(LEGACY_STRUCTURE_PROFILE_VERSION),
    conflicts: z.array(LegacyStructuralConflictSchema)
  })
  .strict();

export const ReconciledStructureSchema = z
  .object({
    schemaVersion: z.literal(RECONCILED_STRUCTURE_SCHEMA_VERSION),
    ...ReconciledStructureFields,
    profileVersion: z.enum([LEGACY_STRUCTURE_PROFILE_VERSION, STRUCTURE_V2_PROFILE.version]),
    conflicts: z.array(StructuralConflictSchema)
  })
  .strict();

export const ReconciledStructureReaderSchema = z.union([
  ReconciledStructureSchema,
  ReconciledStructureV1Schema
]);

export function upcastReconciledStructure(value: unknown): ReconciledStructure {
  const parsed = ReconciledStructureReaderSchema.parse(value);
  if (parsed.schemaVersion === RECONCILED_STRUCTURE_SCHEMA_VERSION) return parsed;
  return ReconciledStructureSchema.parse({
    ...parsed,
    schemaVersion: RECONCILED_STRUCTURE_SCHEMA_VERSION
  });
}

export type StructuralClassificationRequest = z.infer<typeof StructuralClassificationRequestSchema>;
export type StructuralClassificationProposal = z.infer<
  typeof StructuralClassificationProposalSchema
>;
export type StructuralRegion = z.infer<typeof StructuralRegionSchema>;
export type StructuralGroup = z.infer<typeof StructuralGroupSchema>;
export type StructuralExercise = z.infer<typeof StructuralExerciseSchema>;
export type StructuralSharedResource = z.infer<typeof StructuralSharedResourceSchema>;
export type StructuralModelCallManifest = z.infer<typeof StructuralModelCallManifestSchema>;
export type ReconciledStructureV1 = z.infer<typeof ReconciledStructureV1Schema>;
export type ReconciledStructure = z.infer<typeof ReconciledStructureSchema>;
