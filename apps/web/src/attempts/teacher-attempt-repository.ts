import "server-only";

import {
  ATTEMPT_HISTORY_SCHEMA_VERSION,
  LessonSpecSchema,
  TeacherAttemptDetailSchema,
  TeacherAttemptHistoryPageSchema,
  type AttemptHistoryResultStatus,
  type TeacherAttemptDetail,
  type TeacherAttemptHistoryPage,
  type TeacherAttemptSummary,
  type TelegramDeliveryStatus
} from "@lingua-bloom/contracts";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/src/supabase/admin";

export class TeacherAttemptNotFoundError extends Error {}

const ListRowSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_title: z.string(),
  lesson_version: z.number(),
  student_display_name: z.string(),
  created_at: z.string(),
  correct_count: z.number(),
  total_count: z.number(),
  delivery_status: z.string(),
  failure_category: z.string().nullable(),
  matched_count: z.number()
});
const AttemptRowSchema = z.object({
  id: z.string(),
  lesson_id: z.string(),
  lesson_version_id: z.string(),
  lesson_version: z.number(),
  student_display_name: z.string(),
  created_at: z.string(),
  correct_count: z.number(),
  total_count: z.number()
});
const ResponseRowSchema = z.object({
  exercise_id: z.string(),
  answer_field_id: z.string(),
  submitted_value: z.unknown(),
  is_correct: z.boolean(),
  accepted_display_values: z.array(z.string()),
  ordinal: z.number()
});
const OutboxRowSchema = z.object({
  status: z.string(),
  failure_category: z.string().nullable()
});
const CursorSchema = z.object({ createdAt: z.string(), id: z.uuid() }).strict();

export interface TeacherAttemptListQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly query?: string;
  readonly lessonId?: string;
  readonly resultStatus?: AttemptHistoryResultStatus;
  readonly deliveryStatus?: TelegramDeliveryStatus;
}

export async function listTeacherAttempts(
  ownerId: string,
  input: TeacherAttemptListQuery
): Promise<TeacherAttemptHistoryPage> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const cursor = decodeCursor(input.cursor);
  const result = await createAdminSupabaseClient().rpc("list_teacher_attempts", {
    p_owner_id: ownerId,
    p_limit: limit + 1,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_query: input.query?.trim() ?? "",
    p_lesson_id: input.lessonId ?? null,
    p_result_status: input.resultStatus ?? null,
    p_delivery_status: input.deliveryStatus ?? null
  });
  if (result.error) throw new Error("ATTEMPT_HISTORY_READ_FAILED");
  const rows = z.array(ListRowSchema).parse(result.data);
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return TeacherAttemptHistoryPageSchema.parse({
    schemaVersion: ATTEMPT_HISTORY_SCHEMA_VERSION,
    items: visible.map(toSummary),
    totalMatched: rows[0]?.matched_count ?? 0,
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.attempt_id) : null
  });
}

export async function getTeacherAttemptDetail(
  ownerId: string,
  attemptId: string
): Promise<TeacherAttemptDetail> {
  const supabase = createAdminSupabaseClient();
  const attemptResult = await supabase
    .from("student_attempts")
    .select(
      "id,lesson_id,lesson_version_id,lesson_version,student_display_name,created_at,correct_count,total_count"
    )
    .eq("owner_id", ownerId)
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptResult.error || !attemptResult.data) throw new TeacherAttemptNotFoundError();
  const attempt = AttemptRowSchema.parse(attemptResult.data);
  const [lessonResult, versionResult, responseResult, outboxResult] = await Promise.all([
    supabase
      .from("lessons")
      .select("title")
      .eq("owner_id", ownerId)
      .eq("id", attempt.lesson_id)
      .maybeSingle(),
    supabase
      .from("lesson_versions")
      .select("lesson_spec")
      .eq("id", attempt.lesson_version_id)
      .maybeSingle(),
    supabase
      .from("student_attempt_responses")
      .select(
        "exercise_id,answer_field_id,submitted_value,is_correct,accepted_display_values,ordinal"
      )
      .eq("attempt_id", attemptId)
      .order("ordinal"),
    supabase
      .from("telegram_delivery_outbox")
      .select("status,failure_category")
      .eq("owner_id", ownerId)
      .eq("attempt_id", attemptId)
      .maybeSingle()
  ]);
  if (
    lessonResult.error ||
    !lessonResult.data ||
    versionResult.error ||
    !versionResult.data ||
    responseResult.error ||
    outboxResult.error
  )
    throw new TeacherAttemptNotFoundError();
  const outbox = outboxResult.data ? OutboxRowSchema.parse(outboxResult.data) : null;
  const lessonSpec = LessonSpecSchema.parse(
    z.object({ lesson_spec: z.unknown() }).parse(versionResult.data).lesson_spec
  );
  const fieldMetadata = new Map(
    lessonSpec.groups.flatMap((group) =>
      group.exercises.flatMap((exercise) =>
        exercise.answerFields.map(
          (field) =>
            [
              field.id,
              {
                groupOrdinal: group.ordinal,
                groupInstruction: group.instruction,
                exerciseOrdinal: exercise.ordinal,
                exercisePrompt: exercise.prompt
              }
            ] as const
        )
      )
    )
  );
  const summary = toSummary({
    attempt_id: attempt.id,
    lesson_id: attempt.lesson_id,
    lesson_title: z.object({ title: z.string() }).parse(lessonResult.data).title,
    lesson_version: attempt.lesson_version,
    student_display_name: attempt.student_display_name,
    created_at: attempt.created_at,
    correct_count: attempt.correct_count,
    total_count: attempt.total_count,
    delivery_status: outbox?.status ?? "pending",
    failure_category: outbox?.failure_category ?? null,
    matched_count: 1
  });
  return TeacherAttemptDetailSchema.parse({
    schemaVersion: ATTEMPT_HISTORY_SCHEMA_VERSION,
    summary,
    fields: z
      .array(ResponseRowSchema)
      .parse(responseResult.data)
      .map((row) => {
        const metadata = fieldMetadata.get(row.answer_field_id);
        if (!metadata) throw new Error("ATTEMPT_FIELD_NOT_IN_LESSON_VERSION");
        return {
          ordinal: row.ordinal,
          ...metadata,
          exerciseId: row.exercise_id,
          fieldId: row.answer_field_id,
          submittedValue: normalizeSubmitted(row.submitted_value),
          status: row.is_correct ? "correct" : "incorrect",
          acceptedDisplayValues: row.is_correct ? [] : row.accepted_display_values
        };
      })
  });
}

function toSummary(row: z.infer<typeof ListRowSchema>): TeacherAttemptSummary {
  const resultStatus =
    row.correct_count === row.total_count
      ? "correct"
      : row.correct_count === 0
        ? "incorrect"
        : "partial";
  return {
    attemptId: row.attempt_id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    lessonVersion: row.lesson_version,
    studentDisplayName: row.student_display_name,
    createdAt: row.created_at,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    resultStatus,
    delivery: {
      status: z
        .enum(["pending", "sending", "sent", "skipped", "failed"])
        .parse(row.delivery_status),
      failureCategory:
        row.failure_category == null
          ? null
          : z
              .enum(["unauthorized", "rate_limited", "provider", "ambiguous", "internal"])
              .parse(row.failure_category)
    }
  };
}

function normalizeSubmitted(value: unknown): string | string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value : JSON.stringify(value);
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}
function decodeCursor(value: string | undefined) {
  if (!value) return null;
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new Error("INVALID_ATTEMPT_CURSOR");
  }
}
