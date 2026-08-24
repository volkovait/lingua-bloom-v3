import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";

const LessonSchema = z.object({ public_lesson_id: z.string() });
const VersionSchema = z.object({ version: z.number() });

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ lessonRef: string }> }
) {
  try {
    const { lessonRef: lessonId } = await params;
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "lessons", lessonId);
    const [lessonResult, versionsResult] = await Promise.all([
      supabase.from("lessons").select("public_lesson_id").eq("id", lessonId).single(),
      supabase
        .from("lesson_versions")
        .select("version")
        .eq("lesson_id", lessonId)
        .order("version", { ascending: false })
    ]);
    if (lessonResult.error || versionsResult.error) throw new Error("Failed to load versions");
    const lesson = LessonSchema.parse(lessonResult.data);
    return NextResponse.json(
      z
        .array(VersionSchema)
        .parse(versionsResult.data)
        .map(({ version }) => ({
          lessonId,
          publicLessonId: lesson.public_lesson_id,
          version
        }))
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ code: "VERSIONS_FAILED" }, { status: 500 });
  }
}
