import "server-only";

import {
  LessonSpecSchema,
  StudentAttemptResultSchema,
  type StudentAttemptResult,
  type StudentAttemptSubmission
} from "@lingua-bloom/contracts";
import { gradeStudentAttempt } from "@lingua-bloom/lesson-pipeline";
import { createHash } from "node:crypto";

import { createAdminSupabaseClient } from "@/src/supabase/admin";

export class AttemptNotFoundError extends Error {}
export class AttemptConflictError extends Error {}

export async function gradeAndPersistAttempt(
  publicLessonId: string,
  submission: StudentAttemptSubmission
): Promise<StudentAttemptResult> {
  const supabase = createAdminSupabaseClient();
  const lessonResult = await supabase
    .from("lessons")
    .select("id")
    .eq("public_lesson_id", publicLessonId)
    .maybeSingle();
  if (lessonResult.error || !lessonResult.data) throw new AttemptNotFoundError();
  const versionResult = await supabase
    .from("lesson_versions")
    .select("lesson_spec")
    .eq("lesson_id", lessonResult.data.id)
    .eq("version", submission.lessonVersion)
    .maybeSingle();
  if (versionResult.error || !versionResult.data) throw new AttemptNotFoundError();
  const lesson = LessonSpecSchema.parse(versionResult.data.lesson_spec);
  const result = gradeStudentAttempt(lesson, submission);
  const submittedById = new Map(
    submission.responses.map((response) => [response.fieldId, response])
  );
  const responseRows = result.fields.map((field, index) => {
    const submitted = submittedById.get(field.fieldId);
    return {
      exercise_id: field.exerciseId,
      answer_field_id: field.fieldId,
      response_kind: submitted?.kind ?? inferMissingKind(lesson, field.fieldId),
      submitted_value: submittedValue(submitted),
      is_correct: field.status === "correct",
      accepted_display_values: field.acceptedDisplayValues ?? [],
      ordinal: index + 1
    };
  });
  const fingerprint = createHash("sha256").update(canonicalJson(submission)).digest("hex");
  const persisted = await supabase.rpc("submit_student_attempt", {
    p_attempt_id: submission.attemptId,
    p_public_lesson_id: publicLessonId,
    p_lesson_version: submission.lessonVersion,
    p_student_display_name: submission.studentDisplayName,
    p_request_fingerprint: fingerprint,
    p_grader_version: result.graderVersion,
    p_result_payload: result,
    p_response_rows: responseRows
  });
  if (persisted.error) {
    if (persisted.error.message.includes("IDEMPOTENCY_CONFLICT")) throw new AttemptConflictError();
    if (persisted.error.message.includes("NOT_FOUND")) throw new AttemptNotFoundError();
    throw new Error(`Attempt persistence failed: ${persisted.error.message}`);
  }
  return StudentAttemptResultSchema.parse(persisted.data);
}

function submittedValue(response: StudentAttemptSubmission["responses"][number] | undefined) {
  if (!response) return "";
  if (response.kind === "text") return response.value;
  if (response.kind === "choice") return response.optionId;
  return response.tokenIds;
}

function inferMissingKind(lesson: ReturnType<typeof LessonSpecSchema.parse>, fieldId: string) {
  for (const group of lesson.groups)
    for (const exercise of group.exercises)
      if (exercise.answerFields.some((answer) => answer.id === fieldId))
        return exercise.interactionKind === "singleChoice" ||
          exercise.interactionKind === "oddOneOut"
          ? "choice"
          : exercise.interactionKind === "wordOrder"
            ? "orderedTokens"
            : "text";
  return "text";
}

function canonicalJson(value: StudentAttemptSubmission) {
  return JSON.stringify({
    ...value,
    responses: [...value.responses].sort((left, right) => left.fieldId.localeCompare(right.fieldId))
  });
}
