import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { normalizeLessonLibraryStatus } from "@/src/lessons/library-filter";
import { loadLessonLibraryPage } from "@/src/lessons/library-repository";

const QuerySchema = z.object({
  q: z.string().max(160).default(""),
  status: z.string().max(40).optional(),
  cursor: z.string().max(200).optional()
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
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    status: url.searchParams.get("status") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined
  });
  if (!parsed.success) return NextResponse.json({ code: "INVALID_LIBRARY_QUERY" }, { status: 400 });
  try {
    const page = await loadLessonLibraryPage(context.supabase, context.teacher.id, {
      query: parsed.data.q,
      status: normalizeLessonLibraryStatus(parsed.data.status),
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {})
    });
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_LIBRARY_CURSOR")
      return NextResponse.json({ code: "INVALID_LIBRARY_CURSOR" }, { status: 400 });
    return NextResponse.json({ code: "LESSON_LIBRARY_FAILED" }, { status: 500 });
  }
}
