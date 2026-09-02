import type { DocumentIR, StructuralClassificationProposal } from "@lingua-bloom/contracts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { assertExactStructuralCoverage } from "./coverage-validator";
import { reconcileStructuralProposals } from "./reconcile-structure";
import { validateReconciledStructure } from "./validate-structure";

describe("deterministic structural reconciliation", () => {
  test("is idempotent for identical overlapping classifications", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }).filter((value) => value.trim().length > 0),
        (rawText) => {
          const inputDocument = document();
          inputDocument.blocks = [{ id: "block:1", pageIndex: 0, kind: "text", rawText, order: 0 }];
          const first = proposal(
            "proposal:1",
            "window:1",
            [region("region:prompt", "block:1")],
            ["exercise:1"]
          );
          const second = { ...first, proposalId: "proposal:2", windowId: "window:2" };
          const single = reconcileStructuralProposals(inputDocument, [first]);
          const overlapping = reconcileStructuralProposals(inputDocument, [first, second]);

          expect(overlapping.validationStatus).toBe("valid");
          expect(overlapping.regions).toEqual(single.regions);
          expect(overlapping.groups).toEqual(single.groups);
          expect(overlapping.exercises).toEqual(single.exercises);
          expect(overlapping.coverage).toEqual(single.coverage);
        }
      )
    );
  });

  test("deduplicates identical overlap and joins compatible cross-window continuation", () => {
    const first = proposal(
      "proposal:1",
      "window:1",
      [region("region:prompt", "block:1")],
      ["exercise:1"]
    );
    const second = proposal(
      "proposal:2",
      "window:2",
      [region("region:prompt", "block:1"), region("region:option", "block:2", "localOption")],
      ["exercise:1"],
      [
        { blockId: "block:1", outcome: "exerciseComponent", regionIds: ["region:prompt"] },
        { blockId: "block:2", outcome: "exerciseComponent", regionIds: ["region:option"] }
      ]
    );
    const secondGroup = second.groups[0];
    const secondExercise = second.exercises[0];
    if (!secondGroup || !secondExercise) throw new Error("proposal fixture is incomplete");
    second.groups[0] = { ...secondGroup, regionIds: ["region:prompt", "region:option"] };
    second.exercises[0] = { ...secondExercise, optionRegionIds: ["region:option"] };

    const result = reconcileStructuralProposals(document(), [first, second]);
    expect(result.validationStatus).toBe("valid");
    expect(result.regions).toHaveLength(2);
    expect(result.groups[0]?.regionIds).toEqual(["region:prompt", "region:option"]);
    expect(result.coverage).toMatchObject({ significantBlockCount: 2, accountedBlockCount: 2 });
    expect(() => validateReconciledStructure(result)).not.toThrow();
  });

  test("turns missing coverage, dangling relations and low confidence into blocking conflicts", () => {
    const input = proposal(
      "proposal:1",
      "window:1",
      [{ ...region("region:prompt", "block:unknown"), confidence: 0.5 }],
      ["exercise:missing"]
    );
    const inputGroup = input.groups[0];
    if (!inputGroup) throw new Error("proposal fixture is incomplete");
    input.groups[0] = { ...inputGroup, exerciseIds: ["exercise:missing"] };
    input.exercises = [];
    input.coverageClaims = [
      { blockId: "block:1", outcome: "exerciseComponent", regionIds: ["region:missing"] }
    ];

    const result = reconcileStructuralProposals(document(), [input]);
    expect(result.validationStatus).toBe("needsReview");
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining([
        "DANGLING_RELATION",
        "LOW_CONFIDENCE",
        "MISSING_BLOCK",
        "INVALID_INTERACTION"
      ])
    );
    expect(result.coverage.outcomes).toHaveLength(2);
  });

  test("rejects invented model text and zero answer fields at the strict contract", async () => {
    const { StructuralClassificationProposalSchema } = await import("@lingua-bloom/contracts");
    const input = proposal(
      "proposal:1",
      "window:1",
      [region("region:prompt", "block:1")],
      ["exercise:1"]
    );
    expect(
      StructuralClassificationProposalSchema.safeParse({
        ...input,
        regions: [{ ...input.regions[0], inventedText: "not in source" }]
      }).success
    ).toBe(false);
    expect(
      StructuralClassificationProposalSchema.safeParse({
        ...input,
        exercises: [{ ...input.exercises[0], answerFieldCount: 0 }]
      }).success
    ).toBe(false);
  });

  test("rejects invalid valid-state invariants", () => {
    const result = reconcileStructuralProposals(document(), [
      proposal("proposal:1", "window:1", [region("region:prompt", "block:1")], ["exercise:1"])
    ]);
    expect(() =>
      validateReconciledStructure({
        ...result,
        coverage: { ...result.coverage, accountedBlockCount: 1 }
      })
    ).toThrow("accountedBlockCount must equal the number of coverage outcomes");
    expect(() => {
      assertExactStructuralCoverage(document(), {
        significantBlockCount: 2,
        accountedBlockCount: 2,
        outcomes: [
          { blockId: "block:1", kind: "reference", entityIds: ["region:1"] },
          { blockId: "block:unknown", kind: "reference", entityIds: ["region:2"] }
        ]
      });
    }).toThrow("exact significant DocumentIR block set");
  });

  test("blocks overlapping exercises and instruction spans that contain student items", () => {
    const input = proposal(
      "proposal:atomicity",
      "window:1",
      [
        {
          ...region("region:instruction", "block:1", "instruction"),
          source: [{ blockId: "block:1" }]
        },
        {
          ...region("region:prompt:1", "block:1"),
          source: [{ blockId: "block:1", charStart: 0, charEnd: 9 }]
        },
        {
          ...region("region:prompt:2", "block:1"),
          source: [{ blockId: "block:1", charStart: 8, charEnd: 11 }]
        }
      ],
      ["exercise:1", "exercise:2"]
    );
    const overlappingGroup = input.groups[0];
    const firstOverlappingExercise = input.exercises[0];
    const secondOverlappingExercise = input.exercises[1];
    if (!overlappingGroup || !firstOverlappingExercise || !secondOverlappingExercise) {
      throw new Error("overlap fixture is incomplete");
    }
    input.groups[0] = {
      ...overlappingGroup,
      regionIds: ["region:instruction", "region:prompt:1", "region:prompt:2"]
    };
    input.exercises = [
      { ...firstOverlappingExercise, id: "exercise:1", promptRegionIds: ["region:prompt:1"] },
      { ...secondOverlappingExercise, id: "exercise:2", promptRegionIds: ["region:prompt:2"] }
    ];
    input.coverageClaims = [
      {
        blockId: "block:1",
        outcome: "exerciseComponent",
        regionIds: ["region:instruction", "region:prompt:1", "region:prompt:2"]
      },
      { blockId: "block:2", outcome: "boilerplate", regionIds: ["region:instruction"] }
    ];

    const result = reconcileStructuralProposals(document(), [input]);

    expect(result.validationStatus).toBe("needsReview");
    expect(result.conflicts.map((item) => item.code)).toEqual(
      expect.arrayContaining(["NON_ATOMIC_EXERCISE", "MIXED_INSTRUCTION_AND_ITEMS"])
    );
  });
});

function document(): DocumentIR {
  return {
    schemaVersion: "1.0.0",
    parserVersion: "test/1.0.0",
    sourceKind: "pdf",
    id: "ir:1",
    sourceDocumentId: "source:1",
    pages: [{ index: 0, width: 600, height: 800 }],
    blocks: [
      { id: "block:1", pageIndex: 0, kind: "text", rawText: "1. Choose", order: 0 },
      { id: "block:2", pageIndex: 0, kind: "text", rawText: "A option", order: 1 }
    ],
    warnings: []
  };
}

function region(
  id: string,
  blockId: string,
  role: StructuralClassificationProposal["regions"][number]["role"] = "exercisePrompt"
) {
  return { id, role, source: [{ blockId }], confidence: 0.95, evidence: ["visible"] };
}

function proposal(
  proposalId: string,
  windowId: string,
  regions: StructuralClassificationProposal["regions"],
  exerciseIds: string[],
  coverageClaims: StructuralClassificationProposal["coverageClaims"] = [
    { blockId: "block:1", outcome: "exerciseComponent", regionIds: ["region:prompt"] }
  ]
): StructuralClassificationProposal {
  return {
    kind: "structuralClassificationProposal",
    schemaVersion: "1.0.0",
    proposalId,
    documentIrId: "ir:1",
    windowId,
    profileVersion: "structure-v2",
    promptVersion: "structural-classifier-v2",
    modelId: "model:1",
    inputVersion: "1.0.0",
    outputVersion: "1.0.0",
    regions,
    groups: [
      {
        id: "group:1",
        ordinal: 1,
        regionIds: ["region:prompt"],
        exerciseIds,
        sharedResourceIds: [],
        confidence: 0.95
      }
    ],
    exercises: exerciseIds.map((id, index) => ({
      id,
      ordinal: index + 1,
      interactionKind: "singleChoice",
      promptRegionIds: ["region:prompt"],
      gapRegionIds: [],
      optionRegionIds: [],
      sharedResourceIds: [],
      answerFieldCount: 1,
      confidence: 0.95
    })),
    sharedResources: [],
    coverageClaims
  };
}
