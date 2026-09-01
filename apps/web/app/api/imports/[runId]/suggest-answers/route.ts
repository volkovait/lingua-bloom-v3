import { DocumentIRSchema, ReviewDraftSchema } from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ModelSuggestionError,
  applyAnswerSuggestions,
  suggestUnverifiedAnswersWithTelemetry
} from "@/src/ai/openai-answer-suggester.server";
import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getServerEnvironment } from "@/src/config/server-env";

const InputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128)
  })
  .strict();
const DraftRowSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  document_ir_id: z.string().min(1),
  payload: z.unknown()
});
const CasRowSchema = z.object({ new_revision: z.number().int().positive() });

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const input = InputSchema.parse(await request.json());
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
    const draftResult = await supabase
      .from("lesson_drafts")
      .select("id,revision,document_ir_id,payload")
      .eq("run_id", runId)
      .single();
    if (draftResult.error) throw new Error("DRAFT_NOT_FOUND");
    const row = DraftRowSchema.parse(draftResult.data);
    if (row.revision !== input.expectedRevision) return conflict(row.revision);
    const documentResult = await supabase
      .from("document_irs")
      .select("payload")
      .eq("id", row.document_ir_id)
      .single();
    if (documentResult.error) throw new Error("DOCUMENT_IR_NOT_FOUND");
    const environment = getServerEnvironment();
    if (!environment.OPENAI_API_KEY) {
      return NextResponse.json(
        { code: "MODEL_NOT_CONFIGURED", message: "ИИ-подсказки сейчас не настроены." },
        { status: 503 }
      );
    }
    const draft = ReviewDraftSchema.parse(row.payload);
    const result = await suggestUnverifiedAnswersWithTelemetry({
      apiKey: environment.OPENAI_API_KEY,
      baseUrl: environment.OPENAI_BASE_URL,
      model: environment.OPENAI_MODEL,
      draft,
      document: DocumentIRSchema.parse(documentResult.data.payload),
      excludedAnswerFieldIds: []
    });
    if (result.suggestions.length === 0) {
      return NextResponse.json(
        { code: "NO_MODEL_SUGGESTIONS", message: "ИИ не предложил новых ответов." },
        { status: 422 }
      );
    }
    const nextDraft = applyAnswerSuggestions(draft, result.suggestions);
    const rpcResult = (await supabase.rpc("compare_and_swap_lesson_draft", {
      p_draft_id: row.id,
      p_expected_revision: input.expectedRevision,
      p_payload: nextDraft
    })) as { data: unknown; error: { message: string } | null };
    if (rpcResult.error?.message.includes("DRAFT_VERSION_CONFLICT")) {
      return conflict(row.revision);
    }
    if (rpcResult.error) throw new Error(rpcResult.error.message);
    const saved = CasRowSchema.parse(
      Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
    );
    await appendSuggestionEvent(supabase, teacher.id, runId, {
      model: environment.OPENAI_MODEL,
      suggestionCount: result.suggestions.length,
      latencyMs: result.telemetry.latencyMs
    });
    return NextResponse.json({
      runId,
      revision: saved.new_revision,
      suggestionCount: result.suggestions.length
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ code: "INVALID_SUGGESTION_REQUEST" }, { status: 400 });
    if (error instanceof ModelSuggestionError)
      return NextResponse.json(
        {
          code: error.code,
          message: suggestionFailureMessage(error)
        },
        { status: error.kind === "retriable" ? 503 : 502 }
      );
    return NextResponse.json({ code: "SUGGESTION_FAILED" }, { status: 500 });
  }
}

function suggestionFailureMessage(error: ModelSuggestionError): string {
  if (error.code === "MODEL_NETWORK_FAILURE") {
    return "Не удалось установить защищённое соединение с API модели. Черновик не изменён; повторите после проверки TLS-настроек локального сервера.";
  }
  if (error.code === "MODEL_OUTPUT_INVALID") {
    return "Модель вернула неполный или некорректный набор ответов. Черновик не изменён; можно повторить запрос или продолжить вручную.";
  }
  if (error.code === "MODEL_EVIDENCE_VIOLATION") {
    return "Ответ модели не соответствует полям этого черновика. Черновик не изменён; продолжите ручную проверку.";
  }
  if (error.code === "MODEL_HTTP_FAILURE") {
    const status = /status (\d{3})/.exec(error.message)?.[1];
    return status
      ? `API модели отклонил запрос (HTTP ${status}). Черновик не изменён; проверьте доступ и лимиты провайдера.`
      : "API модели отклонил запрос. Черновик не изменён; проверьте доступ и лимиты провайдера.";
  }
  return "ИИ-подсказки получить не удалось. Черновик не изменён; можно продолжить ручную проверку.";
}

function conflict(currentRevision: number) {
  return NextResponse.json(
    {
      code: "DRAFT_VERSION_CONFLICT",
      message: "Черновик изменён. Перезагрузите страницу.",
      currentRevision
    },
    { status: 409 }
  );
}

async function appendSuggestionEvent(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  ownerId: string,
  runId: string,
  attributes: Record<string, unknown>
) {
  const latest = await supabase
    .from("run_events")
    .select("sequence")
    .eq("run_id", runId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequence = Number(latest.data?.sequence ?? 0) + 1;
  await supabase.from("run_events").insert({
    run_id: runId,
    owner_id: ownerId,
    sequence,
    event_type: "model-answer-suggestions-requested",
    payload: {
      runId,
      sequence,
      type: "model-answer-suggestions-requested",
      status: "awaiting_review",
      step: "teacher-requested-answer-suggestions",
      occurredAt: new Date().toISOString(),
      attributes
    }
  });
}
