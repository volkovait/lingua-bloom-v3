import { ReviewDraftSchema, UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import { redactSensitive } from "@lingua-bloom/lesson-pipeline";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getStaleRunRecovery } from "@/src/imports/stale-run-policy";

const RunRowSchema = z.object({
  id: z.string(),
  source_document_id: z.string(),
  status: z.string(),
  current_step: z.string().nullable(),
  last_successful_checkpoint: z.string().nullable(),
  failure_kind: z.string().nullable(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  manual_resume_allowed: z.boolean(),
  updated_at: z.string()
});
const SourceRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["pdf", "text"]),
  storage_ref: z.string()
});
const DraftRowSchema = z
  .object({
    id: z.string(),
    revision: z.number(),
    document_ir_id: z.string(),
    payload: z.unknown()
  })
  .nullable();
const UnknownReviewRowSchema = z
  .object({ document_ir_id: z.string(), payload: z.unknown() })
  .nullable();
const IssueRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  severity: z.string(),
  resolution: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string()
});
const DocumentIrRowSchema = z.object({ payload: z.unknown() });
const EventRowSchema = z.object({
  sequence: z.number().int().positive(),
  event_type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string()
});

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);

    const runResult = await supabase
      .from("pipeline_runs")
      .select(
        "id,source_document_id,status,current_step,last_successful_checkpoint,failure_kind,failure_code,failure_message,manual_resume_allowed,updated_at"
      )
      .eq("id", runId)
      .single();
    if (runResult.error) throw new Error(runResult.error.message);
    const run = RunRowSchema.parse(runResult.data);
    const [sourceResult, draftResult, unknownReviewResult, issueResult, eventResult] =
      await Promise.all([
        supabase
          .from("source_documents")
          .select("id,title,kind,storage_ref")
          .eq("id", run.source_document_id)
          .single(),
        supabase
          .from("lesson_drafts")
          .select("id,revision,document_ir_id,payload")
          .eq("run_id", runId)
          .maybeSingle(),
        supabase
          .from("unknown_layout_reviews")
          .select("document_ir_id,payload")
          .eq("run_id", runId)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("validation_issues")
          .select("id,code,severity,resolution,payload,created_at")
          .eq("run_id", runId)
          .order("created_at", { ascending: true }),
        supabase
          .from("run_events")
          .select("sequence,event_type,payload,created_at")
          .eq("run_id", runId)
          .order("sequence", { ascending: true })
      ]);
    if (
      sourceResult.error ||
      draftResult.error ||
      unknownReviewResult.error ||
      issueResult.error ||
      eventResult.error
    ) {
      throw new Error("Failed to load import workspace");
    }
    const source = SourceRowSchema.parse(sourceResult.data);
    const signed =
      source.kind === "pdf"
        ? await supabase.storage.from("sources").createSignedUrl(source.storage_ref, 3600)
        : null;
    const draftRow = DraftRowSchema.parse(draftResult.data);
    const unknownReviewRow = UnknownReviewRowSchema.parse(unknownReviewResult.data);
    const recovery = getStaleRunRecovery({
      status: run.status,
      updatedAt: run.updated_at,
      draftExists: draftRow !== null
    });
    const documentIrId = draftRow?.document_ir_id ?? unknownReviewRow?.document_ir_id;
    const documentIr = documentIrId
      ? await supabase.from("document_irs").select("payload").eq("id", documentIrId).single()
      : null;

    return NextResponse.json({
      runId: run.id,
      status: run.status,
      currentStep: run.current_step,
      lastSuccessfulCheckpoint: run.last_successful_checkpoint,
      updatedAt: run.updated_at,
      recovery,
      failure:
        run.status === "failed"
          ? {
              code: run.failure_code,
              kind: run.failure_kind,
              message: run.failure_message,
              manualResumeAllowed: run.manual_resume_allowed
            }
          : null,
      source: {
        id: source.id,
        title: source.title,
        kind: source.kind,
        signedUrl: signed?.data?.signedUrl ?? null
      },
      draft: draftRow
        ? {
            id: draftRow.id,
            revision: draftRow.revision,
            payload: ReviewDraftSchema.parse(draftRow.payload)
          }
        : null,
      unknownLayoutReview: unknownReviewRow
        ? UnknownLayoutReviewSchema.parse(unknownReviewRow.payload)
        : null,
      documentIr: documentIr?.data ? DocumentIrRowSchema.parse(documentIr.data).payload : null,
      issues: z
        .array(IssueRowSchema)
        .parse(issueResult.data)
        .map((row) => ({
          ...row.payload,
          id: row.id,
          code: row.code,
          severity: row.severity,
          resolution: row.resolution,
          createdAt: row.created_at
        })),
      events: z.array(EventRowSchema).parse(eventResult.data).map(toPublicWorkflowEvent)
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function toPublicWorkflowEvent(row: z.infer<typeof EventRowSchema>) {
  const payload = redactSensitive(row.payload);
  const safe = z.record(z.string(), z.unknown()).parse(payload);
  return {
    sequence: row.sequence,
    type: typeof safe.type === "string" ? safe.type : row.event_type,
    status: typeof safe.status === "string" ? safe.status : "processing",
    step: typeof safe.step === "string" ? safe.step : null,
    occurredAt: typeof safe.occurredAt === "string" ? safe.occurredAt : row.created_at
  };
}
