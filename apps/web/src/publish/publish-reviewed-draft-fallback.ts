import { createPublicLessonId } from "@lingua-bloom/domain";
import type { LessonSpec, StudentLessonSpec } from "@lingua-bloom/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublishReviewedDraftInput {
  readonly supabase: SupabaseClient;
  readonly ownerId: string;
  readonly runId: string;
  readonly expectedRevision: number;
  readonly lessonId: string;
  readonly version: number;
  readonly sourceDocumentId: string;
  readonly documentIrId: string;
  readonly confirmPermanentPublicAccess: boolean;
  readonly lessonSpec: LessonSpec;
  readonly studentSpec: StudentLessonSpec;
  readonly existingPublicLessonId?: string;
}

export interface PublishReviewedDraftResult {
  readonly lessonId: string;
  readonly publicLessonId: string;
  readonly version: number;
}

export function isMissingPgcryptoFunction(errorMessage: string): boolean {
  return errorMessage.includes("gen_random_bytes");
}

export async function publishReviewedDraftFallback(
  input: PublishReviewedDraftInput
): Promise<PublishReviewedDraftResult> {
  const runResult = await input.supabase
    .from("pipeline_runs")
    .select("status,source_document_id")
    .eq("id", input.runId)
    .eq("owner_id", input.ownerId)
    .single();
  if (runResult.error) throw new Error(runResult.error.message);
  if (runResult.data.status !== "ready_to_publish") throw new Error("PUBLISH_BLOCKED");

  const draftResult = await input.supabase
    .from("lesson_drafts")
    .select("revision")
    .eq("run_id", input.runId)
    .eq("owner_id", input.ownerId)
    .single();
  if (draftResult.error) throw new Error(draftResult.error.message);
  if (draftResult.data.revision !== input.expectedRevision) {
    throw new Error(`DRAFT_VERSION_CONFLICT:${draftResult.data.revision}`);
  }

  const isFirstPublication = input.existingPublicLessonId === undefined;
  if (isFirstPublication && !input.confirmPermanentPublicAccess) {
    throw new Error("PERMANENT_PUBLIC_ACCESS_CONFIRMATION_REQUIRED");
  }

  const publicLessonId = input.existingPublicLessonId ?? createPublicLessonId();
  const studentSpec = {
    ...input.studentSpec,
    publicLessonId
  };

  if (isFirstPublication) {
    const lessonInsert = await input.supabase.from("lessons").insert({
      id: input.lessonId,
      owner_id: input.ownerId,
      title: input.lessonSpec.title,
      public_lesson_id: publicLessonId
    });
    if (lessonInsert.error) throw new Error(lessonInsert.error.message);
  }

  const versionInsert = await input.supabase
    .from("lesson_versions")
    .insert({
      lesson_id: input.lessonId,
      owner_id: input.ownerId,
      source_document_id: input.sourceDocumentId,
      document_ir_id: input.documentIrId,
      run_id: input.runId,
      version: input.version,
      lesson_spec: input.lessonSpec,
      student_spec: studentSpec,
      validation_report: input.lessonSpec.validation
    })
    .select("id,version")
    .single();
  if (versionInsert.error) throw new Error(versionInsert.error.message);

  const lessonUpdate = await input.supabase
    .from("lessons")
    .update({ current_published_version_id: versionInsert.data.id })
    .eq("id", input.lessonId)
    .eq("owner_id", input.ownerId);
  if (lessonUpdate.error) throw new Error(lessonUpdate.error.message);

  const runUpdate = await input.supabase
    .from("pipeline_runs")
    .update({
      status: "completed",
      current_step: "publish-version",
      last_successful_checkpoint: "publish-version",
      updated_at: new Date().toISOString()
    })
    .eq("id", input.runId)
    .eq("owner_id", input.ownerId);
  if (runUpdate.error) throw new Error(runUpdate.error.message);

  return {
    lessonId: input.lessonId,
    publicLessonId,
    version: versionInsert.data.version
  };
}
