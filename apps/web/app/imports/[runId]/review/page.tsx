import { redirect } from "next/navigation";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile, type TeacherProfile } from "@/src/auth/teacher-profile";
import { E2E_REVIEW_RUN_ID, isE2EFixtureMode } from "@/src/testing/e2e-fixtures";

export default async function ReviewImportPage({
  params
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  let profile: TeacherProfile | null = null;
  if (!(isE2EFixtureMode() && runId === E2E_REVIEW_RUN_ID)) {
    try {
      const context = await requireTeacher();
      profile = toTeacherProfile(context.teacher);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        redirect(`/auth/login?next=${encodeURIComponent(`/imports/${runId}/review`)}`);
      }
      throw error;
    }
  }
  const workspace = <ReviewWorkspace runId={runId} />;
  return profile ? <TeacherShell profile={profile}>{workspace}</TeacherShell> : workspace;
}
