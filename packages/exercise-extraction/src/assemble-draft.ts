import type { SourceRef } from "@lingua-bloom/contracts";

export interface ExerciseCandidate {
  readonly id: string;
  readonly ordinal: number;
  readonly prompt: string;
  readonly interactionKind:
    "singleChoice" | "wordOrder" | "bracketGap" | "oddOneOut" | "wordBankGap";
  readonly sourceRefs: readonly SourceRef[];
  readonly options: readonly {
    id: string;
    ordinal: number;
    value: string;
    sourceRefs: readonly SourceRef[];
  }[];
}

export interface ExerciseDraft {
  readonly id: string;
  readonly candidateId: string;
  readonly ordinal: number;
  readonly prompt: string;
  readonly interactionKind: ExerciseCandidate["interactionKind"];
  readonly provenance: { readonly sourceRefs: readonly SourceRef[] };
  readonly options: readonly {
    id: string;
    ordinal: number;
    value: string;
    provenance: { readonly sourceRefs: readonly SourceRef[] };
  }[];
}

export function assembleCandidate(candidate: ExerciseCandidate): ExerciseDraft {
  if (candidate.sourceRefs.length === 0)
    throw new Error(`Candidate ${candidate.id} has no provenance`);
  if (candidate.options.some((option) => option.sourceRefs.length === 0)) {
    throw new Error(`Candidate ${candidate.id} contains an option without provenance`);
  }
  return {
    id: `exercise:${candidate.id}`,
    candidateId: candidate.id,
    ordinal: candidate.ordinal,
    prompt: candidate.prompt,
    interactionKind: candidate.interactionKind,
    provenance: { sourceRefs: candidate.sourceRefs },
    options: candidate.options.map((option) => ({
      ...option,
      provenance: { sourceRefs: option.sourceRefs }
    }))
  };
}
