import { SupabaseSourceRepository } from "@lingua-bloom/document-ingestion";
import {
  createContentHash,
  createOwnerScopedIdempotencyKey,
  createRequestFingerprint,
  SourceTooLargeError
} from "@lingua-bloom/lesson-pipeline";
import { NextResponse } from "next/server";

import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { inngest } from "@/src/inngest/client";
import { INGESTION_IMPORT_REQUESTED } from "@/src/inngest/events";
import { InvalidImportRequestError, parseImportRequest } from "@/src/imports/parse-import-request";

interface ImportBindingRow {
  run_id: string;
  source_document_id: string;
  status: "accepted";
  request_fingerprint: string;
  was_replay: boolean;
}

class EventDispatchError extends Error {
  constructor(
    readonly runId: string,
    readonly sourceDocumentId: string,
    cause: unknown
  ) {
    super("The import was saved but workflow dispatch must be retried", { cause });
    this.name = "EventDispatchError";
  }
}

export async function POST(request: Request) {
  try {
    const { teacher, supabase } = await requireTeacher();
    const input = await parseImportRequest(await request.formData());
    const contentHash = createContentHash(input.bytes);
    const requestFingerprint = createRequestFingerprint({
      title: input.title,
      kind: input.kind,
      contentHash
    });
    const idempotencyKey = createOwnerScopedIdempotencyKey(teacher.id, input.idempotencyKey);
    const existing = await supabase
      .from("pipeline_runs")
      .select("id,source_document_id,request_fingerprint")
      .eq("owner_id", teacher.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.error) throw new Error(`Failed to check import replay: ${existing.error.message}`);
    const existingData: unknown = existing.data;
    const existingRow = parseExistingBinding(existingData);
    if (existingRow && existingRow.request_fingerprint !== requestFingerprint) {
      return NextResponse.json(
        { code: "IDEMPOTENCY_CONFLICT", message: "Key is bound to another request" },
        { status: 409 }
      );
    }

    const repository = new SupabaseSourceRepository(supabase);
    let binding: ImportBindingRow;
    if (existingRow) {
      binding = {
        run_id: existingRow.id,
        source_document_id: existingRow.source_document_id,
        status: "accepted",
        request_fingerprint: existingRow.request_fingerprint,
        was_replay: true
      };
    } else {
      const source = await repository.persist({
        ownerId: teacher.id,
        title: input.title,
        kind: input.kind,
        contentHash,
        bytes: input.bytes,
        mimeType: input.mimeType
      });
      const { data, error } = (await supabase.rpc("bind_import_run", {
        p_source_document_id: source.id,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: requestFingerprint
      })) as { data: unknown; error: { message: string } | null };
      if (error) {
        if (error.message.includes("IDEMPOTENCY_CONFLICT")) {
          return NextResponse.json(
            { code: "IDEMPOTENCY_CONFLICT", message: "Key is bound to another request" },
            { status: 409 }
          );
        }
        throw new Error(`Failed to create import run: ${error.message}`);
      }
      const createdBinding = (Array.isArray(data) ? data[0] : data) as ImportBindingRow | undefined;
      if (!createdBinding) throw new Error("Import binding returned no row");
      binding = createdBinding;
    }

    try {
      await inngest.send({
        id: `import:${binding.run_id}`,
        name: INGESTION_IMPORT_REQUESTED,
        data: {
          ownerId: teacher.id,
          runId: binding.run_id,
          sourceDocumentId: binding.source_document_id,
          kind: input.kind,
          requestFingerprint
        }
      });
    } catch (error) {
      throw new EventDispatchError(binding.run_id, binding.source_document_id, error);
    }

    return NextResponse.json(
      {
        runId: binding.run_id,
        sourceDocumentId: binding.source_document_id,
        status: binding.status
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof InvalidImportRequestError) {
      return NextResponse.json(
        { code: "INVALID_IMPORT", message: error.message },
        { status: error.status }
      );
    }
    if (error instanceof SourceTooLargeError) {
      return NextResponse.json(error.toResponse(), { status: 413 });
    }
    if (error instanceof EventDispatchError) {
      return NextResponse.json(
        {
          code: "EVENT_DISPATCH_FAILED",
          message: error.message,
          runId: error.runId,
          sourceDocumentId: error.sourceDocumentId
        },
        { status: 503 }
      );
    }
    console.error("create import failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function parseExistingBinding(value: unknown): {
  readonly id: string;
  readonly source_document_id: string;
  readonly request_fingerprint: string;
} | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new Error("Invalid existing import binding");

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.source_document_id !== "string" ||
    typeof record.request_fingerprint !== "string"
  ) {
    throw new Error("Invalid existing import binding");
  }

  return {
    id: record.id,
    source_document_id: record.source_document_id,
    request_fingerprint: record.request_fingerprint
  };
}
