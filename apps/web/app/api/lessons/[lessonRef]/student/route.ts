import { NextResponse } from "next/server";

import { findPublicStudentLesson } from "@/src/lessons/student-lesson";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ lessonRef: string }> }
) {
  const { lessonRef: publicLessonId } = await params;
  const lesson = await findPublicStudentLesson(publicLessonId);
  if (!lesson) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(lesson, {
    headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" }
  });
}
