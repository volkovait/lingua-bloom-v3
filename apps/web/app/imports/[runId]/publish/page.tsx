import { redirect } from "next/navigation";

import { TeacherShell } from "@/components/auth/teacher-shell";
import { PublishConfirmation } from "@/components/lesson/publish-confirmation";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile, type TeacherProfile } from "@/src/auth/teacher-profile";
import { E2E_PUBLISH_RUN_ID, isE2EFixtureMode } from "@/src/testing/e2e-fixtures";

export default async function PublishPage({
  params
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  let profile: TeacherProfile | null = null;
  if (!(isE2EFixtureMode() && runId === E2E_PUBLISH_RUN_ID)) {
    try {
      const context = await requireTeacher();
      profile = toTeacherProfile(context.teacher);
    } catch (error) {
      if (error instanceof UnauthenticatedError)
        redirect(`/auth/login?next=${encodeURIComponent(`/imports/${runId}/publish`)}`);
      throw error;
    }
  }
  const content = (
    <main className="publish-page">
      <PublishConfirmation runId={runId} />
    </main>
  );
  return profile ? <TeacherShell profile={profile}>{content}</TeacherShell> : content;
}
