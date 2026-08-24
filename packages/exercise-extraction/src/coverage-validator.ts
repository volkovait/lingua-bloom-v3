import type { CoverageReport } from "@lingua-bloom/contracts";

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
