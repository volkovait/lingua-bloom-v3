import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import {
  getTeacherAttemptDetail,
  TeacherAttemptNotFoundError
} from "@/src/attempts/teacher-attempt-repository";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly attemptId: string }> }
) {
  let teacher;
  try {
    teacher = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
    throw error;
  }
  const { attemptId } = await context.params;
  if (!z.uuid().safeParse(attemptId).success)
    return NextResponse.json({ code: "ATTEMPT_NOT_FOUND" }, { status: 404 });
  try {
    return NextResponse.json(await getTeacherAttemptDetail(teacher.teacher.id, attemptId), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof TeacherAttemptNotFoundError)
      return NextResponse.json({ code: "ATTEMPT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ code: "ATTEMPT_DETAIL_FAILED" }, { status: 500 });
  }
}
