import {
  RECONCILED_STRUCTURE_SCHEMA_VERSION,
  ReconciledStructureSchema,
  STRUCTURE_V2_PROFILE,
  StructuralClassificationProposalSchema,
  type DocumentIR,
  type ReconciledStructure,
  type StructuralClassificationProposal,
  type StructuralExercise,
  type StructuralGroup,
  type StructuralRegion,
  type StructuralSharedResource
} from "@lingua-bloom/contracts";

import { assertExactStructuralCoverage } from "./coverage-validator";

type Conflict = ReconciledStructure["conflicts"][number];

export function reconcileStructuralProposals(
  document: DocumentIR,
  rawProposals: readonly StructuralClassificationProposal[]
): ReconciledStructure {
  if (rawProposals.length === 0) throw new Error("At least one structural proposal is required");
  const documentIrId = document.id ?? document.sourceDocumentId;
  const proposals = rawProposals.map((proposal) =>
    StructuralClassificationProposalSchema.parse(proposal)
  );
  const conflicts: Conflict[] = [];
  const proposalIds = unique(proposals.map((proposal) => proposal.proposalId));
  const knownBlocks = new Map(document.blocks.map((block) => [block.id, block]));

  for (const proposal of proposals) {
    if (proposal.documentIrId !== documentIrId) {
      conflicts.push(
        conflict("DANGLING_RELATION", fallbackBlockIds(document), [proposal.proposalId])
      );
    }
  }

  const regions = mergeRegions(
    proposals.flatMap((proposal) => proposal.regions),
    conflicts,
    proposalIds
  );
  const groups = mergeGroups(
    proposals.flatMap((proposal) => proposal.groups),
    conflicts,
    proposalIds,
    regions
  );
  const exercises = mergeExercises(
    proposals.flatMap((proposal) => proposal.exercises),
    conflicts,
    proposalIds,
    regions
  );
  const sharedResources = mergeSharedResources(
    proposals.flatMap((proposal) => proposal.sharedResources),
    conflicts,
    proposalIds,
    regions
  );

  validateRegionSources(regions, knownBlocks, conflicts, proposalIds);
  validateRelationships(
    groups,
    exercises,
    sharedResources,
    regions,
    conflicts,
    proposalIds,
    document
  );
  validateExerciseAtomicity(groups, exercises, regions, conflicts, proposalIds, document);
  validateConfidence(regions, groups, exercises, sharedResources, conflicts, proposalIds, document);
  validateLeafOwnership(regions, conflicts, proposalIds);

  const significantBlocks = document.blocks.filter((block) => block.rawText.trim().length > 0);
  const claims = proposals.flatMap((proposal) =>
    proposal.coverageClaims.map((claim) => ({ ...claim, proposalId: proposal.proposalId }))
  );
  const outcomes: ReconciledStructure["coverage"]["outcomes"] = [];
  for (const block of significantBlocks) {
    const blockClaims = claims.filter((claim) => claim.blockId === block.id);
    const normalized = unique(
      blockClaims.map((claim) => `${claim.outcome}:${[...claim.regionIds].sort().join(",")}`)
    );
    if (blockClaims.length === 0) {
      const issue = conflict("MISSING_BLOCK", [block.id], proposalIds);
      conflicts.push(issue);
      outcomes.push({ blockId: block.id, kind: "issue", entityIds: [issue.id] });
      continue;
    }
    const danglingRegion = blockClaims
      .flatMap((claim) => claim.regionIds)
      .find((regionId) => !regions.some((region) => region.id === regionId));
    if (danglingRegion || normalized.length > 1) {
      const issue = conflict(
        danglingRegion ? "DANGLING_RELATION" : "OVERLAPPING_OWNERSHIP",
        [block.id],
        unique(blockClaims.map((claim) => claim.proposalId))
      );
      conflicts.push(issue);
      outcomes.push({ blockId: block.id, kind: "issue", entityIds: [issue.id] });
      continue;
    }
    const claim = blockClaims[0];
    if (!claim) continue;
    outcomes.push({
      blockId: block.id,
      kind: mapCoverageKind(claim.outcome),
      entityIds: unique(claim.regionIds)
    });
  }

  const validGroups = groups.length > 0 && exercises.length > 0;
  if (!validGroups) {
    conflicts.push(conflict("INVALID_INTERACTION", fallbackBlockIds(document), proposalIds));
  }
  const deduplicatedConflicts = deduplicateConflicts(conflicts);
  const validationStatus = deduplicatedConflicts.some((item) => item.resolution === "open")
    ? "needsReview"
    : "valid";
  const reconciled = ReconciledStructureSchema.parse({
    schemaVersion: RECONCILED_STRUCTURE_SCHEMA_VERSION,
    documentIrId,
    profileVersion: STRUCTURE_V2_PROFILE.version,
    proposalIds,
    regions,
    groups,
    exercises,
    sharedResources,
    conflicts: deduplicatedConflicts,
    coverage: {
      significantBlockCount: significantBlocks.length,
      accountedBlockCount: outcomes.length,
      outcomes
    },
    validationStatus
  });
  assertExactStructuralCoverage(document, reconciled.coverage);
  return reconciled;
}

function mergeRegions(
  values: readonly StructuralRegion[],
  conflicts: Conflict[],
  proposalIds: readonly string[]
): StructuralRegion[] {
  return mergeCompatible(
    values,
    (left, right) => {
      if (left.role !== right.role) return null;
      return {
        ...left,
        source: uniqueByJson([...left.source, ...right.source]),
        confidence: Math.min(left.confidence, right.confidence),
        evidence: unique([...left.evidence, ...right.evidence])
      };
    },
    conflicts,
    proposalIds,
    (value) => value.source.map((source) => source.blockId)
  );
}

function mergeGroups(
  values: readonly StructuralGroup[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  regions: readonly StructuralRegion[]
): StructuralGroup[] {
  return mergeCompatible(
    values,
    (left, right) => {
      if (left.ordinal !== right.ordinal) return null;
      return {
        ...left,
        regionIds: unique([...left.regionIds, ...right.regionIds]),
        exerciseIds: unique([...left.exerciseIds, ...right.exerciseIds]),
        sharedResourceIds: unique([...left.sharedResourceIds, ...right.sharedResourceIds]),
        confidence: Math.min(left.confidence, right.confidence)
      };
    },
    conflicts,
    proposalIds,
    (value) => blockIdsForRegions(value.regionIds, regions)
  );
}

function mergeExercises(
  values: readonly StructuralExercise[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  regions: readonly StructuralRegion[]
): StructuralExercise[] {
  return mergeCompatible(
    values,
    (left, right) => {
      if (
        left.ordinal !== right.ordinal ||
        left.interactionKind !== right.interactionKind ||
        left.sourceOrdinal !== right.sourceOrdinal ||
        left.answerFieldCount !== right.answerFieldCount
      ) {
        return null;
      }
      return {
        ...left,
        promptRegionIds: unique([...left.promptRegionIds, ...right.promptRegionIds]),
        gapRegionIds: unique([...left.gapRegionIds, ...right.gapRegionIds]),
        optionRegionIds: unique([...left.optionRegionIds, ...right.optionRegionIds]),
        sharedResourceIds: unique([...left.sharedResourceIds, ...right.sharedResourceIds]),
        confidence: Math.min(left.confidence, right.confidence)
      };
    },
    conflicts,
    proposalIds,
    (value) => blockIdsForRegions(value.promptRegionIds, regions)
  );
}

function mergeSharedResources(
  values: readonly StructuralSharedResource[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  regions: readonly StructuralRegion[]
): StructuralSharedResource[] {
  return mergeCompatible(
    values,
    (left, right) => {
      if (left.kind !== right.kind || left.usagePolicy !== right.usagePolicy) return null;
      return {
        ...left,
        entryRegionIds: unique([...left.entryRegionIds, ...right.entryRegionIds]),
        confidence: Math.min(left.confidence, right.confidence)
      };
    },
    conflicts,
    proposalIds,
    (value) => blockIdsForRegions(value.entryRegionIds, regions)
  );
}

function mergeCompatible<T extends { readonly id: string }>(
  values: readonly T[],
  join: (left: T, right: T) => T | null,
  conflicts: Conflict[],
  proposalIds: readonly string[],
  blockIds: (value: T) => string[]
): T[] {
  const merged = new Map<string, T>();
  for (const value of values) {
    const existing = merged.get(value.id);
    if (!existing) {
      merged.set(value.id, value);
      continue;
    }
    const joined = join(existing, value);
    if (joined) merged.set(value.id, joined);
    else {
      conflicts.push(
        conflict(
          "INCOMPATIBLE_CONTINUATION",
          unique([...blockIds(existing), ...blockIds(value)]),
          proposalIds
        )
      );
    }
  }
  return [...merged.values()];
}

function validateRegionSources(
  regions: readonly StructuralRegion[],
  blocks: ReadonlyMap<string, DocumentIR["blocks"][number]>,
  conflicts: Conflict[],
  proposalIds: readonly string[]
): void {
  for (const region of regions) {
    for (const source of region.source) {
      const block = blocks.get(source.blockId);
      const invalidSpan =
        block != null && source.charEnd != null && source.charEnd > block.rawText.length;
      if (!block || invalidSpan) {
        conflicts.push(conflict("DANGLING_RELATION", [source.blockId], proposalIds));
      }
    }
  }
}

function validateRelationships(
  groups: readonly StructuralGroup[],
  exercises: readonly StructuralExercise[],
  resources: readonly StructuralSharedResource[],
  regions: readonly StructuralRegion[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  document: DocumentIR
): void {
  const regionIds = new Set(regions.map((region) => region.id));
  const exerciseIds = new Set(exercises.map((exercise) => exercise.id));
  const resourceIds = new Set(resources.map((resource) => resource.id));
  for (const group of groups) {
    const dangling = [
      ...group.regionIds.filter((id) => !regionIds.has(id)),
      ...group.exerciseIds.filter((id) => !exerciseIds.has(id)),
      ...group.sharedResourceIds.filter((id) => !resourceIds.has(id))
    ];
    if (dangling.length > 0) {
      conflicts.push(
        conflict(
          "DANGLING_RELATION",
          blockIdsForRegions(group.regionIds, regions, document),
          proposalIds
        )
      );
    }
  }
  for (const exercise of exercises) {
    const referencedRegions = [
      ...exercise.promptRegionIds,
      ...exercise.gapRegionIds,
      ...exercise.optionRegionIds
    ];
    if (
      referencedRegions.some((id) => !regionIds.has(id)) ||
      exercise.sharedResourceIds.some((id) => !resourceIds.has(id))
    ) {
      conflicts.push(
        conflict(
          "DANGLING_RELATION",
          blockIdsForRegions(exercise.promptRegionIds, regions, document),
          proposalIds
        )
      );
    }
  }
  for (const resource of resources) {
    if (resource.entryRegionIds.some((id) => !regionIds.has(id))) {
      conflicts.push(
        conflict(
          "DANGLING_RELATION",
          blockIdsForRegions(resource.entryRegionIds, regions, document),
          proposalIds
        )
      );
    }
  }
}

function validateExerciseAtomicity(
  groups: readonly StructuralGroup[],
  exercises: readonly StructuralExercise[],
  regions: readonly StructuralRegion[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  document: DocumentIR
): void {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const blocks = new Map(document.blocks.map((block) => [block.id, block]));

  for (const exercise of exercises) {
    const promptRegions = exercise.promptRegionIds.flatMap((id) => {
      const candidate = regionById.get(id);
      return candidate ? [candidate] : [];
    });
    if (promptRegions.some((region) => region.role !== "exercisePrompt")) {
      conflicts.push(
        conflict(
          "MIXED_INSTRUCTION_AND_ITEMS",
          blockIdsForRegions(exercise.promptRegionIds, regions, document),
          proposalIds
        )
      );
    }
  }

  for (let leftIndex = 0; leftIndex < exercises.length; leftIndex += 1) {
    const left = exercises[leftIndex];
    if (!left) continue;
    for (const right of exercises.slice(leftIndex + 1)) {
      const overlappingBlocks = overlappingRegionBlockIds(
        left.promptRegionIds,
        right.promptRegionIds,
        regionById,
        blocks
      );
      if (overlappingBlocks.length > 0) {
        conflicts.push(conflict("NON_ATOMIC_EXERCISE", overlappingBlocks, proposalIds));
      }
    }
  }

  for (const group of groups) {
    const instructionRegionIds = group.regionIds.filter(
      (id) => regionById.get(id)?.role === "instruction"
    );
    const promptRegionIds = group.exerciseIds.flatMap(
      (id) => exerciseById.get(id)?.promptRegionIds ?? []
    );
    const overlappingBlocks = overlappingRegionBlockIds(
      instructionRegionIds,
      promptRegionIds,
      regionById,
      blocks
    );
    if (overlappingBlocks.length > 0) {
      conflicts.push(conflict("MIXED_INSTRUCTION_AND_ITEMS", overlappingBlocks, proposalIds));
    }
  }
}

function overlappingRegionBlockIds(
  leftIds: readonly string[],
  rightIds: readonly string[],
  regionById: ReadonlyMap<string, StructuralRegion>,
  blocks: ReadonlyMap<string, DocumentIR["blocks"][number]>
): string[] {
  const overlaps: string[] = [];
  const leftSources = leftIds.flatMap((id) => regionById.get(id)?.source ?? []);
  const rightSources = rightIds.flatMap((id) => regionById.get(id)?.source ?? []);
  for (const left of leftSources) {
    for (const right of rightSources) {
      if (left.blockId !== right.blockId) continue;
      const block = blocks.get(left.blockId);
      if (!block) continue;
      const leftStart = left.charStart ?? 0;
      const leftEnd = left.charEnd ?? block.rawText.length;
      const rightStart = right.charStart ?? 0;
      const rightEnd = right.charEnd ?? block.rawText.length;
      if (Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd)) {
        overlaps.push(left.blockId);
      }
    }
  }
  return unique(overlaps);
}

function validateConfidence(
  regions: readonly StructuralRegion[],
  groups: readonly StructuralGroup[],
  exercises: readonly StructuralExercise[],
  resources: readonly StructuralSharedResource[],
  conflicts: Conflict[],
  proposalIds: readonly string[],
  document: DocumentIR
): void {
  for (const region of regions) {
    if (region.role === "unknown") {
      conflicts.push(
        conflict(
          "UNKNOWN_STRUCTURE",
          region.source.map((source) => source.blockId),
          proposalIds
        )
      );
    } else if (region.confidence < STRUCTURE_V2_PROFILE.confidenceThreshold) {
      conflicts.push(
        conflict(
          "LOW_CONFIDENCE",
          region.source.map((source) => source.blockId),
          proposalIds
        )
      );
    }
  }
  for (const group of groups) {
    if (group.confidence < STRUCTURE_V2_PROFILE.confidenceThreshold) {
      conflicts.push(
        conflict(
          "LOW_CONFIDENCE",
          blockIdsForRegions(group.regionIds, regions, document),
          proposalIds
        )
      );
    }
  }
  for (const exercise of exercises) {
    const blocks = blockIdsForRegions(exercise.promptRegionIds, regions, document);
    if (exercise.interactionKind === "unknown") {
      conflicts.push(conflict("UNKNOWN_STRUCTURE", blocks, proposalIds));
    } else if (exercise.confidence < STRUCTURE_V2_PROFILE.confidenceThreshold) {
      conflicts.push(conflict("LOW_CONFIDENCE", blocks, proposalIds));
    }
  }
  for (const resource of resources) {
    if (resource.confidence < STRUCTURE_V2_PROFILE.confidenceThreshold) {
      conflicts.push(
        conflict(
          "LOW_CONFIDENCE",
          blockIdsForRegions(resource.entryRegionIds, regions, document),
          proposalIds
        )
      );
    }
  }
}

function validateLeafOwnership(
  regions: readonly StructuralRegion[],
  conflicts: Conflict[],
  proposalIds: readonly string[]
): void {
  const leafRoles = new Set([
    "localOption",
    "sharedBankEntry",
    "referenceMaterial",
    "example",
    "answerKey",
    "boilerplate"
  ]);
  const owners = new Map<string, StructuralRegion[]>();
  for (const region of regions.filter((candidate) => leafRoles.has(candidate.role))) {
    for (const source of region.source) {
      const key = `${source.blockId}:${String(source.charStart ?? 0)}:${String(source.charEnd ?? "end")}`;
      owners.set(key, [...(owners.get(key) ?? []), region]);
    }
  }
  for (const entries of owners.values()) {
    if (new Set(entries.map((entry) => entry.id)).size > 1) {
      conflicts.push(
        conflict(
          "OVERLAPPING_OWNERSHIP",
          entries.flatMap((entry) => entry.source.map((source) => source.blockId)),
          proposalIds
        )
      );
    }
  }
}

function blockIdsForRegions(
  ids: readonly string[],
  regions: readonly StructuralRegion[],
  document?: DocumentIR
): string[] {
  const found = regions
    .filter((region) => ids.includes(region.id))
    .flatMap((region) => region.source.map((source) => source.blockId));
  return found.length > 0
    ? unique(found)
    : document
      ? fallbackBlockIds(document)
      : ["unresolved:block"];
}

function fallbackBlockIds(document: DocumentIR): string[] {
  return [
    document.blocks.find((block) => block.rawText.trim().length > 0)?.id ??
      `document:${document.sourceDocumentId}`
  ];
}

function mapCoverageKind(
  value: StructuralClassificationProposal["coverageClaims"][number]["outcome"]
): ReconciledStructure["coverage"]["outcomes"][number]["kind"] {
  return value === "unknown" ? "issue" : value;
}

function conflict(
  code: Conflict["code"],
  blockIds: readonly string[],
  proposalIds: readonly string[]
): Conflict {
  const blocks = unique(blockIds.length > 0 ? blockIds : ["unresolved:block"]);
  const proposals = unique(proposalIds.length > 0 ? proposalIds : ["unresolved:proposal"]);
  return {
    id: `conflict:${code}:${blocks.join("|")}:${proposals.join("|")}`,
    code,
    blockIds: blocks,
    proposalIds: proposals,
    resolution: "open"
  };
}

function deduplicateConflicts(values: readonly Conflict[]): Conflict[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueByJson<T>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];
}
