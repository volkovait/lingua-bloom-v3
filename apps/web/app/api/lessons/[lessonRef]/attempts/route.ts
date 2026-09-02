import { PublicLessonIdSchema, StudentAttemptSubmissionSchema } from "@lingua-bloom/contracts";
import { AttemptValidationError } from "@lingua-bloom/lesson-pipeline";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import {
  AttemptConflictError,
  AttemptNotFoundError,
  gradeAndPersistAttempt
} from "@/src/attempts/attempt-repository";
import { getServerEnvironment } from "@/src/config/server-env";
import { inngest } from "@/src/inngest/client";
import { createAdminSupabaseClient } from "@/src/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly lessonRef: string }> }
) {
  const { lessonRef: publicLessonId } = await context.params;
  if (!PublicLessonIdSchema.safeParse(publicLessonId).success)
    return error(404, "LESSON_NOT_FOUND", "Урок не найден");
  if (!(await claimRateLimit(request, publicLessonId)))
    return error(429, "RATE_LIMITED", "Слишком много попыток. Попробуйте позже");
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 256_000)
    return error(413, "ATTEMPT_TOO_LARGE", "Ответы превышают допустимый размер");
  const raw = await request.text();
  if (raw.length > 256_000)
    return error(413, "ATTEMPT_TOO_LARGE", "Ответы превышают допустимый размер");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "INVALID_ATTEMPT", "Некорректные данные попытки");
  }
  const parsed = StudentAttemptSubmissionSchema.safeParse(body);
  if (!parsed.success) return error(400, "INVALID_ATTEMPT", "Проверьте имя и заполненные ответы");
  try {
    const result = await gradeAndPersistAttempt(publicLessonId, parsed.data);
    await inngest
      .send({
        id: `student-attempt:${result.attemptId}`,
        name: "student/attempt.completed",
        data: { attemptId: result.attemptId }
      })
      .catch(() => {
        console.error("Student attempt dispatch failed", { code: "INNGEST_DISPATCH_FAILED" });
      });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    if (failure instanceof AttemptNotFoundError)
      return error(404, "LESSON_NOT_FOUND", "Урок или его версия не найдены");
    if (failure instanceof AttemptConflictError)
      return error(409, "IDEMPOTENCY_CONFLICT", "Эта попытка уже сохранена с другими ответами");
    if (failure instanceof AttemptValidationError)
      return error(400, "INVALID_ATTEMPT", "Ответы не соответствуют опубликованной версии урока");
    return error(500, "ATTEMPT_FAILED", "Не удалось проверить ответы. Попробуйте ещё раз");
  }
}

async function claimRateLimit(request: Request, publicLessonId: string) {
  const environment = getServerEnvironment();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identityHash = createHmac(
    "sha256",
    environment.ATTEMPT_RATE_LIMIT_SECRET ?? environment.SUPABASE_SERVICE_ROLE_KEY
  )
    .update(`${publicLessonId}:${address}`)
    .digest("hex");
  const result = await createAdminSupabaseClient().rpc("claim_student_attempt_rate_limit", {
    p_identity_hash: identityHash,
    p_limit: 30
  });
  return !result.error && result.data === true;
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}
