import type { CoverageReport, DocumentIR, ReconciledStructure } from "@lingua-bloom/contracts";

type StructuralCoverage = ReconciledStructure["coverage"];

export function assertExactStructuralCoverage(
  document: DocumentIR,
  coverage: StructuralCoverage
): void {
  const significantBlockIds = document.blocks
    .filter((block) => block.rawText.trim().length > 0)
    .map((block) => block.id);
  const outcomeBlockIds = coverage.outcomes.map((outcome) => outcome.blockId);
  if (new Set(significantBlockIds).size !== significantBlockIds.length) {
    throw new Error("DocumentIR significant block IDs must be unique");
  }
  if (new Set(outcomeBlockIds).size !== outcomeBlockIds.length) {
    throw new Error("Every significant block must have exactly one structural coverage outcome");
  }
  if (
    coverage.significantBlockCount !== significantBlockIds.length ||
    coverage.accountedBlockCount !== outcomeBlockIds.length
  ) {
    throw new Error("Structural coverage counters do not match their source collections");
  }
  const significantSet = new Set(significantBlockIds);
  if (
    outcomeBlockIds.some((blockId) => !significantSet.has(blockId)) ||
    significantBlockIds.some((blockId) => !outcomeBlockIds.includes(blockId))
  ) {
    throw new Error("Structural coverage must project the exact significant DocumentIR block set");
  }
}

export interface CandidateAccounting {
  readonly candidateId: string;
  readonly exerciseIds?: readonly string[];
  readonly issueId?: string;
  readonly reviewDecisionId?: string;
}

export function buildCoverageReport(
  detectedCandidateIds: readonly string[],
  accounting: readonly CandidateAccounting[],
  unsupportedAdditionCount: number
): CoverageReport {
  const byCandidate = new Map(accounting.map((entry) => [entry.candidateId, entry]));
  const entries: CoverageReport["entries"] = [];
  for (const candidateId of detectedCandidateIds) {
    const entry = byCandidate.get(candidateId);
    if (!entry) continue;
    if (entry.exerciseIds?.length) {
      entries.push({
        candidateId,
        outcome: { kind: "exercise", exerciseIds: [...entry.exerciseIds] }
      });
      continue;
    }
    if (entry.issueId) {
      entries.push({ candidateId, outcome: { kind: "issue", issueId: entry.issueId } });
      continue;
    }
    if (entry.reviewDecisionId) {
      entries.push({
        candidateId,
        outcome: { kind: "decision", reviewDecisionId: entry.reviewDecisionId }
      });
    }
  }
  const accountedCandidateCount = entries.length;
  const hasGap = accountedCandidateCount !== detectedCandidateIds.length;
  return {
    entries,
    detectedCandidateCount: detectedCandidateIds.length,
    accountedCandidateCount,
    unsupportedAdditionCount,
    status: hasGap || unsupportedAdditionCount > 0 ? "blocked" : "passed"
  };
}
