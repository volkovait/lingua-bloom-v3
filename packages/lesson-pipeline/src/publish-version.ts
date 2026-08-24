import {
  LessonSpecSchema,
  ReviewDraftSchema,
  type DocumentIR,
  type LessonSpec,
  type ReviewDraft,
  type SourceRef
} from "@lingua-bloom/contracts";

export class PublicationBlockedError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super("Publication is blocked by unresolved validation");
    this.name = "PublicationBlockedError";
  }
}

export interface PublicationInput {
  readonly lessonId: string;
  readonly version: number;
  readonly draft: ReviewDraft;
  readonly document: DocumentIR;
  readonly openBlockingIssueCount: number;
  readonly unsupportedAdditionCount: number;
}

export type PublicationReadinessInput = Omit<PublicationInput, "lessonId" | "version">;

export function getPublicationBlockReasons(input: PublicationReadinessInput): readonly string[] {
  const draft = ReviewDraftSchema.parse(input.draft);
  const reasons: string[] = [];
  if (input.openBlockingIssueCount > 0) reasons.push("blocking issues remain open");
  if (input.unsupportedAdditionCount > 0) reasons.push("unsupported additions remain");
  const unresolvedAnswerCount = draft.groups.reduce(
    (sum, group) =>
      sum +
      group.exercises.reduce(
        (groupSum, exercise) =>
          groupSum +
          exercise.answerFields.filter(
            (answer) => answer.reviewStatus !== "verified" || answer.acceptedValues.length === 0
          ).length,
        0
      ),
    0
  );
  if (unresolvedAnswerCount > 0) reasons.push("answers remain unverified");
  reasons.push(...validateLineage(draft, input.document));
  return [...new Set(reasons)];
}

export function createPublishedLessonSpec(input: PublicationInput): LessonSpec {
  const draft = ReviewDraftSchema.parse(input.draft);
  const reasons = getPublicationBlockReasons(input);
  if (reasons.length > 0) throw new PublicationBlockedError(reasons);

  return LessonSpecSchema.parse({
    schemaVersion: "1.0.0",
    lessonId: input.lessonId,
    version: input.version,
    title: draft.title,
    sourceDocumentId: draft.sourceDocumentId,
    documentIrId: draft.documentIrId,
    groups: draft.groups,
    validation: {
      status: "passed",
      blockingIssueCount: 0,
      unsupportedAdditionCount: 0,
      unresolvedAnswerCount: 0
    }
  });
}

function validateLineage(draft: ReviewDraft, document: DocumentIR): string[] {
  if (document.id !== draft.documentIrId || document.sourceDocumentId !== draft.sourceDocumentId) {
    return ["draft and DocumentIR lineage differ"];
  }
  const blocks = new Map(document.blocks.map((block) => [block.id, block]));
  const reasons: string[] = [];
  for (const ref of collectRefs(draft)) {
    const block = blocks.get(ref.blockId);
    if (
      ref.sourceDocumentId !== draft.sourceDocumentId ||
      ref.documentIrId !== draft.documentIrId ||
      !block
    ) {
      reasons.push(`invalid SourceRef ${ref.blockId}`);
      continue;
    }
    if (
      ref.charStart != null &&
      ref.charEnd != null &&
      (ref.charStart > block.rawText.length || ref.charEnd > block.rawText.length)
    ) {
      reasons.push(`SourceRef range exceeds block ${ref.blockId}`);
    }
  }
  return reasons;
}

function collectRefs(draft: ReviewDraft): SourceRef[] {
  const refs: SourceRef[] = [];
  const collect = (
    value: { sourceRefs: readonly SourceRef[] } | { reviewDecisionIds: readonly string[] }
  ) => {
    if ("sourceRefs" in value) refs.push(...value.sourceRefs);
  };
  for (const group of draft.groups) {
    collect(group.provenance);
    for (const exercise of group.exercises) {
      collect(exercise.provenance);
      exercise.options.forEach((option) => {
        collect(option.provenance);
      });
      exercise.answerFields.forEach((answer) => {
        collect(answer.evidence);
      });
    }
  }
  return refs;
}
