import { ReviewDraftSchema, type ReviewDraft } from "@lingua-bloom/contracts";

export type ReviewInteractionKind =
  ReviewDraft["groups"][number]["exercises"][number]["interactionKind"];

export interface ExerciseCreateInput {
  readonly groupId: string;
  readonly prompt: string;
  readonly interactionKind: ReviewInteractionKind;
  readonly options: readonly string[];
  readonly answerValues: readonly string[];
}

export interface ExerciseDeleteInput {
  readonly exerciseId: string;
  readonly reason: string;
}

export interface ExerciseEditIssue {
  readonly id: string;
  readonly resolution: "open" | "resolved" | "acceptedRisk";
  readonly payload: unknown;
}

export function getIssueIdsResolvedByExerciseEdit(
  issues: readonly ExerciseEditIssue[],
  exerciseId: string
): string[] {
  return issues
    .filter((issue) => issue.resolution === "open")
    .filter((issue) => readIssueCode(issue.payload) === "SOURCE_TRUNCATED")
    .filter((issue) => readIssueEntityIds(issue.payload).includes(exerciseId))
    .map((issue) => issue.id);
}

export function applyExerciseCreate(
  draft: ReviewDraft,
  input: ExerciseCreateInput,
  decisionId: string,
  exerciseId = `teacher:${crypto.randomUUID()}`
) {
  const group = draft.groups.find((candidate) => candidate.id === input.groupId);
  if (!group) throw new Error("Exercise group does not exist in the current draft");
  const prompt = input.prompt.trim();
  const answers = input.answerValues.map((value) => value.trim()).filter(Boolean);
  const options = input.options.map((value) => value.trim()).filter(Boolean);
  if (!prompt || answers.length === 0)
    throw new Error("A new exercise requires a prompt and answer");
  if (["singleChoice", "oddOneOut"].includes(input.interactionKind) && options.length < 2) {
    throw new Error("This interaction requires at least two options");
  }
  const ordinal = Math.max(0, ...group.exercises.map((exercise) => exercise.ordinal)) + 1;
  const evidence = { reviewDecisionIds: [decisionId] };
  const exercise = {
    id: exerciseId,
    ordinal,
    interactionKind: input.interactionKind,
    prompt,
    provenance: evidence,
    options: options.map((value, index) => ({
      id: `${exerciseId}:option:${String(index + 1)}`,
      ordinal: index + 1,
      value,
      provenance: evidence
    })),
    answerFields: answers.map((value, index) => ({
      id: `${exerciseId}:answer:${String(index + 1)}`,
      acceptedValues: [value],
      provenance: "teacherSupplied" as const,
      reviewStatus: "verified" as const,
      evidence
    }))
  };
  const next = {
    ...draft,
    schemaVersion: "1.1.0" as const,
    groups: draft.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, exercises: [...candidate.exercises, exercise] }
        : candidate
    )
  };
  return {
    draft: ReviewDraftSchema.parse(next),
    exercise,
    afterValue: exercise
  };
}

export function applyExerciseDelete(
  draft: ReviewDraft,
  input: ExerciseDeleteInput,
  decisionId: string
) {
  const targetGroup = draft.groups.find((group) =>
    group.exercises.some((exercise) => exercise.id === input.exerciseId)
  );
  const target = targetGroup?.exercises.find((exercise) => exercise.id === input.exerciseId);
  if (!targetGroup || !target) throw new Error("Exercise does not exist in the current draft");
  const exerciseCount = draft.groups.reduce((sum, group) => sum + group.exercises.length, 0);
  if (exerciseCount <= 1) throw new Error("The final exercise cannot be deleted");
  const removedEntityIds = [
    target.id,
    ...target.options.map((option) => option.id),
    ...target.answerFields.map((answer) => answer.id),
    ...(targetGroup.exercises.length === 1 ? [targetGroup.id] : [])
  ];
  const groups = draft.groups
    .map((group) =>
      group.id === targetGroup.id
        ? {
            ...group,
            exercises: group.exercises
              .filter((exercise) => exercise.id !== target.id)
              .map((exercise, index) => ({ ...exercise, ordinal: index + 1 }))
          }
        : group
    )
    .filter((group) => group.exercises.length > 0);
  const entries = draft.coverage.entries.map((entry) =>
    entry.outcome.kind === "exercise" && entry.outcome.exerciseIds.includes(target.id)
      ? {
          candidateId: entry.candidateId,
          outcome: { kind: "decision" as const, reviewDecisionId: decisionId }
        }
      : entry
  );
  return {
    draft: ReviewDraftSchema.parse({
      ...draft,
      schemaVersion: "1.1.0",
      groups,
      coverage: { ...draft.coverage, entries }
    }),
    beforeValue: target,
    removedEntityIds
  };
}

function readIssueCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("code" in payload)) return null;
  return typeof payload.code === "string" ? payload.code : null;
}

function readIssueEntityIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("entityIds" in payload)) return [];
  return Array.isArray(payload.entityIds)
    ? payload.entityIds.filter((id): id is string => typeof id === "string")
    : [];
}
