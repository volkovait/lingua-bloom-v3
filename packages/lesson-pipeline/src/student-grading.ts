import type {
  AttemptFieldResult,
  LessonSpec,
  StudentAttemptResult,
  StudentAttemptSubmission
} from "@lingua-bloom/contracts";
import { STUDENT_ATTEMPT_SCHEMA_VERSION, STUDENT_GRADER_VERSION } from "@lingua-bloom/contracts";
import { matchesEnglishAnswer, normalizeEnglishAnswer } from "@lingua-bloom/domain";

export class AttemptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptValidationError";
  }
}

export function gradeStudentAttempt(
  lesson: LessonSpec,
  submission: StudentAttemptSubmission,
  deliveryStatus: "pending" | "skipped" = "pending"
): StudentAttemptResult {
  if (lesson.version !== submission.lessonVersion)
    throw new AttemptValidationError("Attempt lesson version does not match the published version");

  const submitted = new Map(submission.responses.map((response) => [response.fieldId, response]));
  const expectedIds = new Set(
    lesson.groups.flatMap((group) =>
      group.exercises.flatMap((exercise) => exercise.answerFields.map((field) => field.id))
    )
  );
  for (const fieldId of submitted.keys())
    if (!expectedIds.has(fieldId))
      throw new AttemptValidationError(`Unknown answer field: ${fieldId}`);

  const fields: AttemptFieldResult[] = [];
  const exerciseResults: StudentAttemptResult["exercises"] = [];
  for (const group of lesson.groups) {
    for (const exercise of group.exercises) {
      let correctCount = 0;
      for (const answer of exercise.answerFields) {
        const response = submitted.get(answer.id);
        const correct = response ? gradeField(exercise, answer.acceptedValues, response) : false;
        if (correct) correctCount += 1;
        fields.push({
          fieldId: answer.id,
          exerciseId: exercise.id,
          status: correct ? "correct" : "incorrect",
          ...(!correct ? { acceptedDisplayValues: [...answer.acceptedValues] } : {})
        });
      }
      exerciseResults.push({
        exerciseId: exercise.id,
        status:
          correctCount === exercise.answerFields.length
            ? "correct"
            : correctCount === 0
              ? "incorrect"
              : "partial"
      });
    }
  }

  return {
    schemaVersion: STUDENT_ATTEMPT_SCHEMA_VERSION,
    attemptId: submission.attemptId,
    lessonVersion: submission.lessonVersion,
    graderVersion: STUDENT_GRADER_VERSION,
    score: {
      correct: fields.filter((field) => field.status === "correct").length,
      total: fields.length
    },
    fields,
    exercises: exerciseResults,
    delivery: { status: deliveryStatus }
  };
}

function gradeField(
  exercise: LessonSpec["groups"][number]["exercises"][number],
  acceptedValues: readonly string[],
  response: StudentAttemptSubmission["responses"][number]
) {
  const expectedKind =
    exercise.interactionKind === "singleChoice" || exercise.interactionKind === "oddOneOut"
      ? "choice"
      : exercise.interactionKind === "wordOrder"
        ? "orderedTokens"
        : "text";
  if (response.kind !== expectedKind)
    throw new AttemptValidationError(`Response kind mismatch for ${response.fieldId}`);

  if (response.kind === "choice") {
    if (!response.optionId) return false;
    const option = exercise.options.find((candidate) => candidate.id === response.optionId);
    if (!option) throw new AttemptValidationError(`Choice does not belong to ${exercise.id}`);
    return acceptedValues.some(
      (accepted) =>
        accepted === option.id ||
        normalizeComparable(accepted) === normalizeComparable(option.value)
    );
  }
  if (response.kind === "orderedTokens") {
    return matchesEnglishAnswer(response.tokenIds.join(" "), acceptedValues);
  }
  return matchesEnglishAnswer(response.value, acceptedValues);
}

function normalizeComparable(value: string) {
  return normalizeEnglishAnswer(value);
}
