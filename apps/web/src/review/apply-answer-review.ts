import { ReviewDraftSchema, type ReviewDraft } from "@lingua-bloom/contracts";

export interface AnswerReviewInput {
  readonly answerFieldId: string;
  readonly replacementValue: string;
}

export function applyTeacherAnswerReview(
  draft: ReviewDraft,
  review: AnswerReviewInput,
  decisionId: string
) {
  const target = draft.groups
    .flatMap((group) => group.exercises)
    .flatMap((exercise) => exercise.answerFields)
    .find((field) => field.id === review.answerFieldId);
  if (!target) throw new Error("Answer field does not exist in the current draft");
  const replacement = review.replacementValue.trim();
  if (!replacement) throw new Error("A verified answer requires a replacement value");
  const beforeValue = {
    acceptedValues: target.acceptedValues,
    provenance: target.provenance,
    reviewStatus: target.reviewStatus,
    evidence: target.evidence
  };
  const afterValue = {
    acceptedValues: [replacement],
    provenance: "teacherSupplied" as const,
    reviewStatus: "verified" as const,
    evidence: { reviewDecisionIds: [decisionId] }
  };
  const next = {
    ...draft,
    groups: draft.groups.map((group) => ({
      ...group,
      exercises: group.exercises.map((exercise) => ({
        ...exercise,
        answerFields: exercise.answerFields.map((field) =>
          field.id === review.answerFieldId
            ? { ...field, ...afterValue, confidence: undefined }
            : field
        )
      }))
    }))
  };
  return { draft: ReviewDraftSchema.parse(next), beforeValue, afterValue };
}
