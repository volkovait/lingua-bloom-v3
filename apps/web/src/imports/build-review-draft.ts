import { ReviewDraftSchema, type ReviewDraft, type ValidationIssue } from "@lingua-bloom/contracts";
import type { extractPdfExercises, extractTextExercises } from "@lingua-bloom/exercise-extraction";

type ReviewDraftExtraction =
  ReturnType<typeof extractPdfExercises> | ReturnType<typeof extractTextExercises>;

export function buildReviewDraft(
  title: string,
  sourceDocumentId: string,
  documentIrId: string,
  extraction: ReviewDraftExtraction,
  issues: readonly ValidationIssue[]
): ReviewDraft {
  return ReviewDraftSchema.parse({
    schemaVersion: "1.1.0" as const,
    title,
    sourceDocumentId,
    documentIrId,
    groups: extraction.groups.map((group) => ({
      id: group.id,
      ordinal: group.ordinal,
      ...(group.sourceOrder != null ? { sourceOrder: group.sourceOrder } : {}),
      ...(group.completeness ? { completeness: group.completeness } : {}),
      ...(group.missingBoundary ? { missingBoundary: group.missingBoundary } : {}),
      instruction: group.instruction,
      provenance: { sourceRefs: [...group.sourceRefs] },
      sharedResources: (group.sharedResources ?? []).map((resource) => ({
        id: resource.id,
        ordinal: resource.ordinal,
        kind: resource.kind,
        entries: resource.entries.map((entry) => ({
          id: entry.id,
          ordinal: entry.ordinal,
          value: entry.value,
          provenance: { sourceRefs: [...entry.sourceRefs] }
        })),
        usagePolicy: resource.usagePolicy,
        provenance: { sourceRefs: [...resource.sourceRefs] }
      })),
      exercises: group.exercises.map((exercise) => ({
        id: exercise.id,
        ordinal: exercise.itemOrdinal,
        interactionKind: exercise.interactionKind,
        prompt: exercise.prompt,
        provenance: { sourceRefs: [...exercise.sourceRefs] },
        ...(exercise.sharedResourceId ? { sharedResourceId: exercise.sharedResourceId } : {}),
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
    referenceBlocks: extraction.referenceBlocks?.map((block) => ({
      id: block.id,
      ordinal: block.ordinal,
      sourceOrder: block.sourceOrder,
      lines: block.lines.map((line) => ({
        id: line.id,
        ordinal: line.ordinal,
        rawText: line.rawText,
        provenance: { sourceRefs: [...line.sourceRefs] }
      }))
    })),
    coverage: {
      ...extraction.coverage,
      status: issues.length > 0 ? ("needsReview" as const) : extraction.coverage.status
    }
  });
}
