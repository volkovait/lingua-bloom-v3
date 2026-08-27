import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getStaleRunRecovery } from "@/src/imports/stale-run-policy";
import { inngest } from "@/src/inngest/client";
import { INGESTION_IMPORT_REQUESTED } from "@/src/inngest/events";
import { isMissingRpcFunction } from "@/src/supabase/rpc-compat";

const RedispatchSchema = z.object({ idempotencyKey: z.string().min(16).max(128) }).strict();
const FallbackRunSchema = z.object({
  status: z.string(),
  updated_at: z.string(),
  source_document_id: z.string().min(1),
  request_fingerprint: z.string().min(1)
});

const RedispatchClaimSchema = z.object({
  dispatch_request_id: z.string().min(1),
  run_id: z.string().min(1),
  source_document_id: z.string().min(1),
  request_fingerprint: z.string().min(1),
  source_kind: z.enum(["pdf", "text"]),
  reason: z.enum(["dispatch_not_started", "worker_heartbeat_expired"]),
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
    const input = RedispatchSchema.parse(await request.json());
    const { data, error } = (await supabase.rpc("claim_stale_import_dispatch", {
      p_run_id: runId,
      p_idempotency_key: input.idempotencyKey
    })) as { data: unknown; error: { message: string } | null };

    if (error?.message.includes("DISPATCH_NOT_STALE")) {
      return NextResponse.json({ code: "DISPATCH_NOT_STALE" }, { status: 409 });
    }
    if (error?.message.includes("DISPATCH_NOT_ALLOWED")) {
      return NextResponse.json({ code: "DISPATCH_NOT_ALLOWED" }, { status: 409 });
    }
    if (error?.message.includes("IDEMPOTENCY_KEY_CONFLICT")) {
      return NextResponse.json({ code: "IDEMPOTENCY_KEY_CONFLICT" }, { status: 409 });
    }
    if (isMissingRpcFunction(error, "claim_stale_import_dispatch")) {
      const claim = await claimStaleImportDispatchFallback(
        supabase,
        teacher.id,
        runId,
        input.idempotencyKey
      );
      try {
        await inngest.send({
          id: `redispatch:${claim.dispatchRequestId}`,
          name: INGESTION_IMPORT_REQUESTED,
          data: {
            ownerId: teacher.id,
            runId,
            sourceDocumentId: claim.sourceDocumentId,
            kind: claim.sourceKind,
            requestFingerprint: claim.requestFingerprint
          }
        });
      } catch {
        return NextResponse.json(
          {
            code: "EVENT_DISPATCH_FAILED",
            message: "Повторная доставка не удалась. Повторите действие с тем же ключом."
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          runId,
          status: "accepted",
          recoveryReason: claim.reason,
          replayed: false
        },
        { status: 202 }
      );
    }
    if (error) throw new Error(error.message);

    const claim = RedispatchClaimSchema.parse(Array.isArray(data) ? data[0] : data);
    try {
      await inngest.send({
        id: `redispatch:${claim.dispatch_request_id}`,
        name: INGESTION_IMPORT_REQUESTED,
        data: {
          ownerId: teacher.id,
          runId,
          sourceDocumentId: claim.source_document_id,
          kind: claim.source_kind,
          requestFingerprint: claim.request_fingerprint
        }
      });
    } catch {
      return NextResponse.json(
        {
          code: "EVENT_DISPATCH_FAILED",
          message: "Повторная доставка не удалась. Повторите действие с тем же ключом."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        runId,
        status: "accepted",
        recoveryReason: claim.reason,
        replayed: claim.replayed
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ code: "INVALID_REDISPATCH" }, { status: 400 });
    console.error("stale import redispatch failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ code: "REDISPATCH_FAILED" }, { status: 500 });
  }
}

async function claimStaleImportDispatchFallback(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  ownerId: string,
  runId: string,
  idempotencyKey: string
) {
  const [runResult, draftResult] = await Promise.all([
    supabase
      .from("pipeline_runs")
      .select("status,updated_at,source_document_id,request_fingerprint")
      .eq("id", runId)
      .eq("owner_id", ownerId)
      .single(),
    supabase
      .from("lesson_drafts")
      .select("id")
      .eq("run_id", runId)
      .eq("owner_id", ownerId)
      .maybeSingle()
  ]);
  if (runResult.error) throw new Error(runResult.error.message);
  if (draftResult.error) throw new Error(draftResult.error.message);
  if (draftResult.data) throw new Error("DISPATCH_NOT_ALLOWED");

  const run = FallbackRunSchema.parse(runResult.data);
  const recovery = getStaleRunRecovery({
    status: run.status,
    updatedAt: run.updated_at,
    draftExists: false
  });
  if (!recovery) throw new Error("DISPATCH_NOT_STALE");

  const sourceResult = await supabase
    .from("source_documents")
    .select("kind")
    .eq("id", run.source_document_id)
    .eq("owner_id", ownerId)
    .single();
  if (sourceResult.error) throw new Error(sourceResult.error.message);
  const sourceKind = z.enum(["pdf", "text"]).parse(sourceResult.data.kind);

  return {
    dispatchRequestId: `${runId}:${idempotencyKey}`,
    sourceDocumentId: run.source_document_id,
    requestFingerprint: run.request_fingerprint,
    sourceKind,
    reason: recovery.kind
  };
}
