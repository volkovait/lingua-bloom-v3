import { DocumentIRSchema, ReviewDraftSchema } from "@lingua-bloom/contracts";
import {
  createPublishedLessonSpec,
  projectStudentLesson,
  PublicationBlockedError
} from "@lingua-bloom/lesson-pipeline";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import {
  isMissingPgcryptoFunction,
  publishReviewedDraftFallback
} from "@/src/publish/publish-reviewed-draft-fallback";

const PublishSchema = z
  .object({ confirmPermanentPublicAccess: z.literal(true).optional() })
  .strict();
const RunSchema = z.object({ source_document_id: z.string(), status: z.string() });
const DraftSchema = z.object({
  revision: z.number(),
  document_ir_id: z.string(),
  payload: z.unknown()
});
const ExistingVersionSchema = z.object({ lesson_id: z.string(), version: z.number() }).nullable();
const LessonIdentitySchema = z.object({ id: z.string(), public_lesson_id: z.string() });
const PublishResultSchema = z.object({
  lesson_id: z.string(),
  public_lesson_id: z.string(),
  version: z.number()
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
    const input = PublishSchema.parse(await request.json());
    const [runResult, draftResult, issuesResult] = await Promise.all([
      supabase.from("pipeline_runs").select("source_document_id,status").eq("id", runId).single(),
      supabase
        .from("lesson_drafts")
        .select("revision,document_ir_id,payload")
        .eq("run_id", runId)
        .single(),
      supabase
        .from("validation_issues")
        .select("id", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("severity", "blocking")
        .eq("resolution", "open")
    ]);
    if (runResult.error || draftResult.error || issuesResult.error)
      throw new Error("Failed to load publication state");
    const run = RunSchema.parse(runResult.data);
    const draftRow = DraftSchema.parse(draftResult.data);
    if (run.status !== "ready_to_publish") {
      return NextResponse.json(
        {
          code: "PUBLISH_BLOCKED",
          message: "Урок ещё не прошёл все проверки публикации.",
          reasons: ["publication review is incomplete"]
        },
        { status: 409 }
      );
    }
    const documentResult = await supabase
      .from("document_irs")
      .select("payload")
      .eq("id", draftRow.document_ir_id)
      .single();
    if (documentResult.error) throw new Error(documentResult.error.message);
    const document = DocumentIRSchema.parse(documentResult.data.payload);
    const draft = ReviewDraftSchema.parse(draftRow.payload);

    const latestResult = await supabase
      .from("lesson_versions")
      .select("lesson_id,version")
      .eq("owner_id", teacher.id)
      .eq("source_document_id", run.source_document_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResult.error) throw new Error(latestResult.error.message);
    const latest = ExistingVersionSchema.parse(latestResult.data);
    const lessonId = latest?.lesson_id ?? crypto.randomUUID();
    const version = (latest?.version ?? 0) + 1;
    let publicLessonId = "pending_public_lesson_id";
    if (latest) {
      const lessonResult = await supabase
        .from("lessons")
        .select("id,public_lesson_id")
        .eq("id", lessonId)
        .single();
      if (lessonResult.error) throw new Error(lessonResult.error.message);
      publicLessonId = LessonIdentitySchema.parse(lessonResult.data).public_lesson_id;
    }

    const lessonSpec = createPublishedLessonSpec({
      lessonId,
      version,
      draft,
      document,
      openBlockingIssueCount: issuesResult.count ?? 0,
      unsupportedAdditionCount: draft.coverage.unsupportedAdditionCount
    });
    const studentSpec = projectStudentLesson(lessonSpec, publicLessonId);
    const { data, error } = (await supabase.rpc("publish_reviewed_draft", {
      p_run_id: runId,
      p_expected_revision: draftRow.revision,
      p_lesson_id: lessonId,
      p_confirm_permanent_public_access: input.confirmPermanentPublicAccess ?? false,
      p_lesson_spec: lessonSpec,
      p_student_spec: studentSpec,
      p_validation_report: lessonSpec.validation
    })) as { data: unknown; error: { message: string } | null };
    if (
      error?.message.includes("PUBLISH_BLOCKED") ||
      error?.message.includes("PERMANENT_PUBLIC_ACCESS_CONFIRMATION_REQUIRED")
    ) {
      return NextResponse.json(
        {
          code: "PUBLISH_BLOCKED",
          message: "Урок ещё не прошёл все проверки публикации.",
          reasons: [error.message]
        },
        { status: 409 }
      );
    }
    if (error) {
      if (isMissingPgcryptoFunction(error.message)) {
        const published = await publishReviewedDraftFallback({
          supabase,
          ownerId: teacher.id,
          runId,
          expectedRevision: draftRow.revision,
          lessonId,
          version,
          sourceDocumentId: run.source_document_id,
          documentIrId: draftRow.document_ir_id,
          confirmPermanentPublicAccess: input.confirmPermanentPublicAccess ?? false,
          lessonSpec,
          studentSpec,
          ...(latest ? { existingPublicLessonId: publicLessonId } : {})
        });
        return NextResponse.json(
          {
            lessonId: published.lessonId,
            publicLessonId: published.publicLessonId,
            version: published.version
          },
          { status: 201 }
        );
      }
      throw new Error(error.message);
    }
    const published = PublishResultSchema.parse(Array.isArray(data) ? data[0] : data);
    return NextResponse.json(
      {
        lessonId: published.lesson_id,
        publicLessonId: published.public_lesson_id,
        version: published.version
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof PublicationBlockedError)
      return NextResponse.json(
        {
          code: "PUBLISH_BLOCKED",
          message: "Устраните причины блокировки и повторите публикацию.",
          reasons: error.reasons
        },
        { status: 409 }
      );
    if (error instanceof z.ZodError)
      return NextResponse.json({ code: "INVALID_PUBLICATION" }, { status: 400 });
    return NextResponse.json({ code: "PUBLISH_FAILED" }, { status: 500 });
  }
}
