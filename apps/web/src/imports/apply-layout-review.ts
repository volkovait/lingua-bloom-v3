import {
  ReviewDraftSchema,
  UnknownLayoutReviewSchema,
  type LayoutReviewSubmission,
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
    return {
      id: crypto.randomUUID(),
      ...decision,
      actorId: input.actorId,
      createdAt: now
    };
  });
  const allDecisions = [...input.review.decisions, ...decisions];
  const complete = allDecisions.length === input.review.candidates.length;
  const classified = allDecisions.filter((decision) => decision.action === "classify");
  if (complete && classified.length === 0) throw new Error("ZERO_VALID_GROUP");

  const nextReview = UnknownLayoutReviewSchema.parse({
    ...input.review,
    revision: input.review.revision + 1,
    status: complete ? "resolved" : "active",
    decisions: allDecisions,
    coverage: {
      ...input.review.coverage,
      accountedCandidateCount: allDecisions.length
    },
    updatedAt: now
  });
  if (!complete) return { review: nextReview, draft: null, decisions, answerIssues: [] };

  const exercises = classified.map((decision, index) => {
    const candidate = candidates.get(decision.candidateId);
    if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");
    return candidateToSingleChoice(candidate, decision.id, index + 1);
  });
  const excluded = allDecisions.filter((decision) => decision.action === "exclude");
  const draft = ReviewDraftSchema.parse({
    schemaVersion: "1.1.0",
    title: input.title,
    sourceDocumentId: input.review.sourceDocumentId,
    documentIrId: input.review.documentIrId,
    groups: [
      {
        id: `layout-review:${input.review.runId}:group:1`,
        ordinal: 1,
        instruction: "Выберите правильный вариант.",
        provenance: { reviewDecisionIds: classified.map((decision) => decision.id) },
        sharedResources: [],
        exercises
      }
    ],
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
  const answerIssues = exercises.map((exercise) => {
    const answer = exercise.answerFields[0];
    if (!answer) throw new Error("ANSWER_FIELD_NOT_CREATED");
    return {
      id: crypto.randomUUID(),
      code: "ANSWER_UNVERIFIED" as const,
      severity: "blocking" as const,
      entityIds: [answer.id],
      evidence: answer.evidence.sourceRefs,
      message: "The source has no verified answer key for this answer field",
      resolution: "open" as const
    };
  });
  return { review: nextReview, draft, decisions, answerIssues, excludedCount: excluded.length };
}

function candidateToSingleChoice(
  candidate: UnknownExerciseCandidate,
  decisionId: string,
  ordinal: number
) {
  const lines = candidate.rawPrompt.split(/\r?\n/).map((line) => line.trim());
  const firstOption = lines.findIndex((line) => /^[a-d][.)]?\s+/i.test(line));
  if (firstOption < 1) throw new Error("CANDIDATE_OPTIONS_NOT_FOUND");
  const promptLines = lines.slice(0, firstOption);
  const hasExplicitBlank = promptLines.some((line) => line.includes("___"));
  const prompt = promptLines
    .join(" ")
    .replace(/^(?:question\s*)?\d{1,3}[.)\s]+/i, "")
    .replace(/\t+/g, hasExplicitBlank ? " " : " ___ ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
  const optionLines = lines.slice(firstOption);
  const options = optionLines.flatMap((line, index) => {
    const match = line.match(/^([a-d])[.)]?\s+(.+)$/i);
    const label = match?.[1];
    return label && match[2]
      ? [
          {
            id: `candidate:${candidate.id}:option:${label.toLowerCase()}`,
            ordinal: index + 1,
            value: match[2].trim(),
            provenance: { sourceRefs: candidate.sourceRefs }
          }
        ]
      : [];
  });
  if (!prompt || options.length < 2) throw new Error("CANDIDATE_OPTIONS_NOT_FOUND");
  return {
    id: `candidate:${candidate.id}:exercise`,
    ordinal,
    interactionKind: "singleChoice" as const,
    prompt,
    provenance: { reviewDecisionIds: [decisionId] },
    options,
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
