import { upcastReconciledStructure, type ReconciledStructure } from "@lingua-bloom/contracts";

export function validateReconciledStructure(value: unknown): ReconciledStructure {
  const structure = upcastReconciledStructure(value);
  if (structure.coverage.accountedBlockCount !== structure.coverage.outcomes.length) {
    throw new Error("accountedBlockCount must equal the number of coverage outcomes");
  }
  if (structure.coverage.accountedBlockCount !== structure.coverage.significantBlockCount) {
    throw new Error("Every significant block must have one coverage outcome");
  }
  if (
    new Set(structure.coverage.outcomes.map((outcome) => outcome.blockId)).size !==
    structure.coverage.outcomes.length
  ) {
    throw new Error("Every significant block must have exactly one coverage outcome");
  }
  if (structure.validationStatus === "valid") {
    if (structure.conflicts.some((conflict) => conflict.resolution === "open")) {
      throw new Error("A valid structure cannot contain open conflicts");
    }
    if (structure.groups.length === 0 || structure.exercises.length === 0) {
      throw new Error("A valid structure requires at least one group and exercise");
    }
  }
  return structure;
}
