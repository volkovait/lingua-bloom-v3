import {
  ReviewDraftSchema,
  UnknownLayoutReviewSchema,
  type LayoutReviewSubmission,
  type TeacherClassifiableInteractionKind,
  type UnknownCandidateDecision,
  type UnknownExerciseCandidate,
  type UnknownLayoutReview
} from "@lingua-bloom/contracts";

export function applyLayoutReviewSubmission(input: {
  readonly review: UnknownLayoutReview;
  readonly submission: LayoutReviewSubmission;
  readonly actorId: string;
  readonly title: string;
}) {
  const existing = new Set(input.review.decisions.map((decision) => decision.candidateId));
  const candidates = new Map(input.review.candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const decisions = input.submission.decisions.map((decision): UnknownCandidateDecision => {
    if (existing.has(decision.candidateId)) throw new Error("CANDIDATE_ALREADY_DECIDED");
    if (seen.has(decision.candidateId)) throw new Error("CANDIDATE_DECISION_DUPLICATED");
    if (!candidates.has(decision.candidateId)) throw new Error("CANDIDATE_NOT_FOUND");
    seen.add(decision.candidateId);
    return { id: crypto.randomUUID(), ...decision, actorId: input.actorId, createdAt: now };
  });
  const allDecisions = [...input.review.decisions, ...decisions];
  const complete = allDecisions.length === input.review.candidates.length;
  const classified = allDecisions.filter((decision) => decision.action === "classify");
  if (complete && classified.length === 0) throw new Error("ZERO_VALID_GROUP");

  const nextReview = UnknownLayoutReviewSchema.parse({
    ...input.review,
    schemaVersion: "1.1.0",
    revision: input.review.revision + 1,
    status: complete ? "resolved" : "active",
    decisions: allDecisions,
    coverage: { ...input.review.coverage, accountedCandidateCount: allDecisions.length },
    updatedAt: now
  });
  if (!complete) return { review: nextReview, draft: null, decisions, answerIssues: [] };

  const exercises = classified.map((decision, index) => {
    const candidate = candidates.get(decision.candidateId);
    if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");
    return candidateToExercise(candidate, decision.id, index + 1, decision.interactionKind);
  });
  const referenceDecisions = allDecisions.filter(
    (decision) => decision.action === "mark" && decision.outcome === "reference"
  );
  const referenceBlocks = referenceDecisions.map((decision, index) => {
    const candidate = candidates.get(decision.candidateId);
    if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");
    return {
      id: `candidate:${candidate.id}:reference`,
      ordinal: index + 1,
      sourceOrder: index,
      lines: [
        {
          id: `candidate:${candidate.id}:reference:line:1`,
          ordinal: 1,
          rawText: candidate.rawPrompt,
          provenance: { reviewDecisionIds: [decision.id] }
        }
      ]
    };
  });
  const draft = ReviewDraftSchema.parse({
    schemaVersion: "1.1.0",
    title: input.title,
    sourceDocumentId: input.review.sourceDocumentId,
    documentIrId: input.review.documentIrId,
    groups: [
      {
        id: `layout-review:${input.review.runId}:group:1`,
        ordinal: 1,
        instruction: "Выполните задания.",
        provenance: { reviewDecisionIds: classified.map((decision) => decision.id) },
        sharedResources: [],
        exercises
      }
    ],
    ...(referenceBlocks.length > 0 ? { referenceBlocks } : {}),
    coverage: {
      entries: allDecisions.map((decision) => ({
        candidateId: decision.candidateId,
        outcome:
          decision.action === "classify"
            ? { kind: "exercise", exerciseIds: [`candidate:${decision.candidateId}:exercise`] }
            : { kind: "decision", reviewDecisionId: decision.id }
      })),
      detectedCandidateCount: input.review.candidates.length,
      accountedCandidateCount: allDecisions.length,
      unsupportedAdditionCount: 0,
      status: "needsReview"
    }
  });
  const answerIssues = exercises.flatMap((exercise) =>
    exercise.answerFields.map((answer) => ({
      id: crypto.randomUUID(),
      code: "ANSWER_UNVERIFIED" as const,
      severity: "blocking" as const,
      entityIds: [answer.id],
      evidence: answer.evidence.sourceRefs,
      message: "The source has no verified answer key for this answer field",
      resolution: "open" as const
    }))
  );
  const excludedCount = allDecisions.filter((decision) => decision.action === "exclude").length;
  return { review: nextReview, draft, decisions, answerIssues, excludedCount };
}

function candidateToExercise(
  candidate: UnknownExerciseCandidate,
  decisionId: string,
  ordinal: number,
  interactionKind: TeacherClassifiableInteractionKind
) {
  const choice = interactionKind === "singleChoice" || interactionKind === "oddOneOut";
  const parsed = choice ? parseChoiceCandidate(candidate) : null;
  const prompt = parsed?.prompt ?? cleanPrompt(candidate.rawPrompt);
  if (!prompt) throw new Error("CANDIDATE_PROMPT_NOT_FOUND");
  return {
    id: `candidate:${candidate.id}:exercise`,
    ordinal,
    interactionKind,
    prompt,
    provenance: { reviewDecisionIds: [decisionId] },
    options: parsed?.options ?? [],
    answerFields: [
      {
        id: `candidate:${candidate.id}:answer:1`,
        acceptedValues: [],
        provenance: "deterministicRule" as const,
        reviewStatus: "needsReview" as const,
        evidence: { sourceRefs: candidate.sourceRefs }
      }
    ]
  };
}

function parseChoiceCandidate(candidate: UnknownExerciseCandidate) {
  const lines = candidate.rawPrompt.split(/\r?\n/).map((line) => line.trim());
  const firstOption = lines.findIndex((line) => /^[a-zа-яё][.)]?\s+/iu.test(line));
  if (firstOption < 1) throw new Error("CANDIDATE_OPTIONS_NOT_FOUND");
  const promptLines = lines.slice(0, firstOption);
  const hasExplicitBlank = promptLines.some((line) => line.includes("___"));
  const prompt = cleanPrompt(
    promptLines.join(" ").replace(/\t+/gu, hasExplicitBlank ? " " : " ___ ")
  );
  const options = lines.slice(firstOption).flatMap((line, index) => {
    const match = line.match(/^([a-zа-яё])[.)]?\s+(.+)$/iu);
    const label = match?.[1];
    return label && match[2]
      ? [
          {
            id: `candidate:${candidate.id}:option:${label.toLocaleLowerCase()}`,
            ordinal: index + 1,
            value: match[2].trim(),
            provenance: { sourceRefs: candidate.sourceRefs }
          }
        ]
      : [];
  });
  if (!prompt || options.length < 2) throw new Error("CANDIDATE_OPTIONS_NOT_FOUND");
  return { prompt, options };
}

function cleanPrompt(value: string): string {
  return value
    .replace(/^(?:question\s*)?\d{1,3}[.)\s]+/iu, "")
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .trim();
}
