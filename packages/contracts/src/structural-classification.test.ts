import { describe, expect, test } from "vitest";

import {
  ReconciledStructureSchema,
  ReconciledStructureV1Schema,
  STRUCTURE_V2_PROFILE,
  StructuralClassificationProposalSchema,
  StructuralClassificationRequestSchema,
  StructuralModelCallManifestSchema,
  upcastReconciledStructure
} from "./structural-classification";

const block = {
  id: "block:1",
  ordinal: 0,
  rawText: "1. Choose ___ answer.",
  pageIndex: 0,
  bbox: null,
  style: null
};

const request = {
  kind: "structuralClassificationRequest",
  schemaVersion: "1.0.0",
  documentIrId: "ir:1",
  windowId: "window:1",
  windowOrdinal: 0,
  profileVersion: "structure-v2",
  promptVersion: "structural-classifier-v2",
  modelId: "model:1",
  inputVersion: "1.0.0",
  outputVersion: "1.0.0",
  blocks: [block],
  overlapBefore: [],
  overlapAfter: []
} as const;

const proposal = {
  kind: "structuralClassificationProposal",
  schemaVersion: "1.0.0",
  proposalId: "proposal:1",
  documentIrId: "ir:1",
  windowId: "window:1",
  profileVersion: "structure-v2",
  promptVersion: "structural-classifier-v2",
  modelId: "model:1",
  inputVersion: "1.0.0",
  outputVersion: "1.0.0",
  regions: [
    {
      id: "region:1",
      role: "exercisePrompt",
      source: [{ blockId: "block:1" }],
      confidence: 0.95,
      evidence: ["numbered prompt"]
    }
  ],
  groups: [
    {
      id: "group:1",
      ordinal: 1,
      regionIds: ["region:1"],
      exerciseIds: ["exercise:1"],
      sharedResourceIds: [],
      confidence: 0.95
    }
  ],
  exercises: [
    {
      id: "exercise:1",
      ordinal: 1,
      interactionKind: "inlineGap",
      promptRegionIds: ["region:1"],
      gapRegionIds: [],
      optionRegionIds: [],
      sharedResourceIds: [],
      answerFieldCount: 1,
      confidence: 0.95
    }
  ],
  sharedResources: [],
  coverageClaims: [{ blockId: "block:1", outcome: "exerciseComponent", regionIds: ["region:1"] }]
} as const;

describe("structural classification contracts", () => {
  test("accepts a version-pinned bounded request and strict proposal", () => {
    expect(StructuralClassificationRequestSchema.parse(request).blocks).toHaveLength(1);
    expect(StructuralClassificationProposalSchema.parse(proposal).exercises).toHaveLength(1);
    expect(STRUCTURE_V2_PROFILE).toMatchObject({
      maxBlocksPerWindow: 64,
      maxEstimatedInputTokens: 12_000,
      overlapBlocks: 8,
      confidenceThreshold: 0.8,
      timeoutMs: 45_000,
      maxAttempts: 2,
      maxConcurrentWindows: 3
    });
  });

  test("rejects unknown fields, partial spans and exercises without an answer field", () => {
    expect(
      StructuralClassificationRequestSchema.safeParse({ ...request, hiddenInstruction: true })
        .success
    ).toBe(false);
    expect(
      StructuralClassificationProposalSchema.safeParse({
        ...proposal,
        regions: [{ ...proposal.regions[0], source: [{ blockId: "block:1", charStart: 0 }] }]
      }).success
    ).toBe(false);
    expect(
      StructuralClassificationProposalSchema.safeParse({
        ...proposal,
        exercises: [{ ...proposal.exercises[0], answerFieldCount: 0 }]
      }).success
    ).toBe(false);
  });

  test("requires explicit provider cost availability", () => {
    const manifest = {
      schemaVersion: "1.0.0",
      id: "call:1",
      runId: "run:1",
      documentIrId: "ir:1",
      windowId: "window:1",
      modelId: "model:1",
      promptVersion: "structural-classifier-v2",
      inputVersion: "1.0.0",
      outputVersion: "1.0.0",
      profileVersion: "structure-v2",
      attempt: 1,
      startedAt: "2026-09-02T10:00:00.000Z",
      finishedAt: "2026-09-02T10:00:01.000Z",
      durationMs: 1000,
      outcome: "succeeded",
      inputTokens: 100,
      outputTokens: 50,
      cost: null,
      currency: null,
      costUnavailable: true,
      aggregateCounts: { blocks: 1 }
    } as const;
    expect(StructuralModelCallManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      StructuralModelCallManifestSchema.safeParse({ ...manifest, costUnavailable: false }).success
    ).toBe(false);
  });

  test("accepts a strict globally reconciled artifact", () => {
    expect(
      ReconciledStructureSchema.safeParse({
        schemaVersion: "1.1.0",
        documentIrId: "ir:1",
        profileVersion: "structure-v2",
        proposalIds: ["proposal:1"],
        regions: proposal.regions,
        groups: proposal.groups,
        exercises: proposal.exercises,
        sharedResources: [],
        conflicts: [],
        coverage: {
          significantBlockCount: 1,
          accountedBlockCount: 1,
          outcomes: [{ blockId: "block:1", kind: "exerciseComponent", entityIds: ["region:1"] }]
        },
        validationStatus: "valid"
      }).success
    ).toBe(true);
  });

  test("reads legacy ReconciledStructure 1.0 and upcasts without changing lineage", () => {
    const legacy = {
      schemaVersion: "1.0.0",
      documentIrId: "ir:1",
      profileVersion: "structure-v1",
      proposalIds: ["proposal:1"],
      regions: proposal.regions,
      groups: proposal.groups,
      exercises: proposal.exercises,
      sharedResources: [],
      conflicts: [
        {
          id: "conflict:1",
          code: "LOW_CONFIDENCE",
          blockIds: ["block:1"],
          proposalIds: ["proposal:1"],
          resolution: "open"
        }
      ],
      coverage: {
        significantBlockCount: 1,
        accountedBlockCount: 1,
        outcomes: [{ blockId: "block:1", kind: "issue", entityIds: ["conflict:1"] }]
      },
      validationStatus: "needsReview"
    } as const;

    expect(ReconciledStructureV1Schema.safeParse(legacy).success).toBe(true);
    expect(upcastReconciledStructure(legacy)).toMatchObject({
      schemaVersion: "1.1.0",
      profileVersion: "structure-v1",
      proposalIds: ["proposal:1"],
      conflicts: [{ code: "LOW_CONFIDENCE" }]
    });
  });

  test("keeps current ReconciledStructure 1.1 unchanged and rejects v2 conflicts in legacy input", () => {
    const current = {
      schemaVersion: "1.1.0",
      documentIrId: "ir:1",
      profileVersion: "structure-v2",
      proposalIds: ["proposal:1"],
      regions: proposal.regions,
      groups: proposal.groups,
      exercises: proposal.exercises,
      sharedResources: [],
      conflicts: [],
      coverage: {
        significantBlockCount: 1,
        accountedBlockCount: 1,
        outcomes: [{ blockId: "block:1", kind: "exerciseComponent", entityIds: ["region:1"] }]
      },
      validationStatus: "valid"
    } as const;

    expect(upcastReconciledStructure(current)).toEqual(current);
    expect(
      ReconciledStructureV1Schema.safeParse({
        ...current,
        schemaVersion: "1.0.0",
        profileVersion: "structure-v1",
        conflicts: [
          {
            id: "conflict:1",
            code: "NON_ATOMIC_EXERCISE",
            blockIds: ["block:1"],
            proposalIds: ["proposal:1"],
            resolution: "open"
          }
        ]
      }).success
    ).toBe(false);
  });
});
