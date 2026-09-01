import { LayoutReviewSubmissionSchema, UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { applyLayoutReviewSubmission } from "@/src/imports/apply-layout-review";
import { inngest } from "@/src/inngest/client";
import { INGESTION_REVIEW_SUBMITTED } from "@/src/inngest/events";

const ReviewRowSchema = z.object({ revision: z.number().int().positive(), payload: z.unknown() });
const SourceRowSchema = z.object({ title: z.string().min(1) });
const RunSourceSchema = z.object({ source_document_id: z.string().min(1) });
const RpcRowSchema = z.object({
  new_revision: z.number().int().positive(),
  run_status: z.string().min(1),
  replayed: z.boolean()
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
    const submission = LayoutReviewSubmissionSchema.parse(await request.json());
    const [reviewResult, runResult] = await Promise.all([
      supabase
        .from("unknown_layout_reviews")
        .select("revision,payload")
        .eq("run_id", runId)
        .eq("status", "active")
        .single(),
      supabase.from("pipeline_runs").select("source_document_id").eq("id", runId).single()
    ]);
    if (reviewResult.error || runResult.error) throw new Error("LAYOUT_REVIEW_NOT_FOUND");
    const reviewRow = ReviewRowSchema.parse(reviewResult.data);
    if (reviewRow.revision !== submission.expectedRevision) {
      return conflict(reviewRow.revision);
    }
    const runSource = RunSourceSchema.parse(runResult.data);
    const sourceResult = await supabase
      .from("source_documents")
      .select("title")
      .eq("id", runSource.source_document_id)
      .single();
    if (sourceResult.error) throw new Error("SOURCE_NOT_FOUND");
    const source = SourceRowSchema.parse(sourceResult.data);
    const applied = applyLayoutReviewSubmission({
      review: UnknownLayoutReviewSchema.parse(reviewRow.payload),
      submission,
      actorId: teacher.id,
      title: source.title
    });
    const fingerprint = await sha256(JSON.stringify(submission));
    const rpcResult = (await supabase.rpc("apply_unknown_layout_review_submission", {
      p_run_id: runId,
      p_expected_revision: submission.expectedRevision,
      p_idempotency_key: submission.idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_review_payload: applied.review,
      p_review_status: applied.review.status,
      p_decisions: applied.decisions,
      p_draft_payload: applied.draft,
      p_answer_issues: applied.answerIssues
    })) as { data: unknown; error: { message: string } | null };
    const { data, error } = rpcResult;
    if (error?.message.includes("LAYOUT_REVIEW_VERSION_CONFLICT")) {
      const revision = Number(error.message.match(/LAYOUT_REVIEW_VERSION_CONFLICT:(\d+)/)?.[1]);
      return conflict(Number.isInteger(revision) ? revision : reviewRow.revision);
    }
    if (error?.message.includes("IDEMPOTENCY_CONFLICT")) {
      return NextResponse.json(
        { code: "IDEMPOTENCY_CONFLICT", message: "Этот ключ уже использован для другого решения." },
        { status: 409 }
      );
    }
    if (error) throw new Error(error.message);
    const row = RpcRowSchema.parse(Array.isArray(data) ? data[0] : data);
    if (applied.draft && !row.replayed) {
      await inngest.send({
        id: `layout-review:${runId}:${submission.idempotencyKey}`,
        name: INGESTION_REVIEW_SUBMITTED,
        data: { ownerId: teacher.id, runId, revision: 1 }
      });
    }
    return NextResponse.json(
      {
        runId,
        revision: row.new_revision,
        status: row.run_status,
        replayed: row.replayed,
        draftRevision: applied.draft ? 1 : null
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { code: "INVALID_LAYOUT_REVIEW", issues: error.issues },
        { status: 400 }
      );
    if (error instanceof Error && error.message === "ZERO_VALID_GROUP")
      return NextResponse.json(
        { code: "ZERO_VALID_GROUP", message: "Хотя бы один фрагмент нужно сохранить как задание." },
        { status: 400 }
      );
    if (error instanceof Error && error.message === "CANDIDATE_OPTIONS_NOT_FOUND")
      return NextResponse.json(
        {
          code: "CANDIDATE_OPTIONS_NOT_FOUND",
          message: "У фрагмента не удалось выделить варианты ответа."
        },
        { status: 400 }
      );
    return NextResponse.json({ code: "LAYOUT_REVIEW_FAILED" }, { status: 500 });
  }
}

function conflict(currentRevision: number) {
  return NextResponse.json(
    {
      code: "LAYOUT_REVIEW_VERSION_CONFLICT",
      message: "Решения изменены в другой вкладке. Перезагрузите страницу.",
      currentRevision
    },
    { status: 409 }
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
