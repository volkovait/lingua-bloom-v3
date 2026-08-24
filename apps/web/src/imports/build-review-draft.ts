import { ReviewDraftSchema, type ReviewDraft, type ValidationIssue } from "@lingua-bloom/contracts";
import type { extractPdfExercises } from "@lingua-bloom/exercise-extraction";

export function buildReviewDraft(
  title: string,
  sourceDocumentId: string,
  documentIrId: string,
  extraction: ReturnType<typeof extractPdfExercises>,
  issues: readonly ValidationIssue[]
): ReviewDraft {
  return ReviewDraftSchema.parse({
    schemaVersion: "1.0.0" as const,
    title,
    sourceDocumentId,
    documentIrId,
    groups: extraction.groups.map((group) => ({
      id: group.id,
      ordinal: group.ordinal,
      instruction: group.instruction,
      provenance: { sourceRefs: [...group.sourceRefs] },
      exercises: group.exercises.map((exercise) => ({
        id: exercise.id,
        ordinal: exercise.itemOrdinal,
        interactionKind: exercise.interactionKind,
        prompt: exercise.prompt,
        provenance: { sourceRefs: [...exercise.sourceRefs] },
        options: exercise.options.map((option) => ({
          id: option.id,
          ordinal: option.ordinal,
          value: option.value,
          provenance: { sourceRefs: [...option.sourceRefs] }
        })),
        answerFields: exercise.answerFields.map((answer) => ({
          id: answer.id,
          acceptedValues: [...answer.acceptedValues],
          provenance: answer.provenance,
          reviewStatus: answer.reviewStatus,
          evidence: { sourceRefs: [...answer.sourceRefs] }
        }))
      }))
    })),
    coverage: {
      ...extraction.coverage,
      status: issues.length > 0 ? ("needsReview" as const) : extraction.coverage.status
    }
  });
}
