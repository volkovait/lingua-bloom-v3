import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { inngest } from "@/src/inngest/client";
import { INGESTION_IMPORT_REQUESTED } from "@/src/inngest/events";

const ResumeSchema = z.object({ idempotencyKey: z.string().min(16).max(128) }).strict();
const ResumeResultSchema = z.object({
  run_id: z.string().min(1),
  source_document_id: z.string().min(1),
  request_fingerprint: z.string().min(1),
  source_kind: z.enum(["pdf", "text"]),
  checkpoint: z.string().nullable(),
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
    const input = ResumeSchema.parse(await request.json());
    const { data, error } = (await supabase.rpc("resume_failed_import", {
      p_run_id: runId,
      p_idempotency_key: input.idempotencyKey
    })) as { data: unknown; error: { message: string } | null };
    if (error?.message.includes("RESUME_NOT_ALLOWED")) {
      return NextResponse.json({ code: "RESUME_NOT_ALLOWED" }, { status: 409 });
    }
    if (error?.message.includes("IDEMPOTENCY_KEY_CONFLICT")) {
      return NextResponse.json({ code: "IDEMPOTENCY_KEY_CONFLICT" }, { status: 409 });
    }
    if (error) throw new Error(error.message);
    const resumed = ResumeResultSchema.parse(Array.isArray(data) ? data[0] : data);
    await inngest.send({
      id: `resume:${runId}:${input.idempotencyKey}`,
      name: INGESTION_IMPORT_REQUESTED,
      data: {
        ownerId: teacher.id,
        runId,
        sourceDocumentId: resumed.source_document_id,
        kind: resumed.source_kind,
        requestFingerprint: resumed.request_fingerprint
      }
    });
    return NextResponse.json(
      {
        runId,
        status: "processing",
        resumedFromCheckpoint: resumed.checkpoint,
        replayed: resumed.replayed
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ code: "INVALID_RESUME" }, { status: 400 });
    return NextResponse.json({ code: "RESUME_FAILED" }, { status: 500 });
  }
}
