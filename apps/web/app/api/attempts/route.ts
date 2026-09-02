import {
  AttemptHistoryResultStatusSchema,
  TelegramDeliveryStatusSchema
} from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { listTeacherAttempts } from "@/src/attempts/teacher-attempt-repository";

const QuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().max(160).default(""),
  lessonId: z.uuid().optional(),
  resultStatus: AttemptHistoryResultStatusSchema.optional(),
  deliveryStatus: TelegramDeliveryStatusSchema.optional()
});

export async function GET(request: Request) {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
    throw error;
  }
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return NextResponse.json({ code: "INVALID_ATTEMPT_FILTERS" }, { status: 400 });
  try {
    const page = await listTeacherAttempts(context.teacher.id, {
      limit: parsed.data.limit,
      ...(parsed.data.query ? { query: parsed.data.query } : {}),
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.lessonId ? { lessonId: parsed.data.lessonId } : {}),
      ...(parsed.data.resultStatus ? { resultStatus: parsed.data.resultStatus } : {}),
      ...(parsed.data.deliveryStatus ? { deliveryStatus: parsed.data.deliveryStatus } : {})
    });
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof Error && error.message === "INVALID_ATTEMPT_CURSOR" ? 400 : 500;
    return NextResponse.json(
      { code: status === 400 ? "INVALID_ATTEMPT_CURSOR" : "ATTEMPT_HISTORY_FAILED" },
      { status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
