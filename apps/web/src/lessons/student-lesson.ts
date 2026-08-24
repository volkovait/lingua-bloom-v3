import "server-only";

import { PublicLessonIdSchema, StudentLessonSpecSchema } from "@lingua-bloom/contracts";

import { createAdminSupabaseClient } from "@/src/supabase/admin";
import { getE2EStudentLesson } from "@/src/testing/e2e-fixtures";

export async function findPublicStudentLesson(publicLessonId: string) {
  const parsed = PublicLessonIdSchema.safeParse(publicLessonId);
  if (!parsed.success) return null;
  const fixture = getE2EStudentLesson(parsed.data);
  if (fixture) return StudentLessonSpecSchema.parse(fixture);
  const supabase = createAdminSupabaseClient();
  const lessonResult = await supabase
    .from("lessons")
    .select("current_published_version_id")
    .eq("public_lesson_id", parsed.data)
    .maybeSingle();
  if (lessonResult.error || !lessonResult.data?.current_published_version_id) return null;
  const versionResult = await supabase
    .from("lesson_versions")
    .select("student_spec")
    .eq("id", lessonResult.data.current_published_version_id)
    .maybeSingle();
  if (versionResult.error || !versionResult.data) return null;
  const student = StudentLessonSpecSchema.safeParse(versionResult.data.student_spec);
  return student.success ? student.data : null;
}
