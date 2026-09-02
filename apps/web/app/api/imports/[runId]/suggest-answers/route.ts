import { DocumentIRSchema, ReviewDraftSchema } from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AnswerSuggestionSchema,
  ModelSuggestionError,
  applyAnswerSuggestions,
  createAnswerSuggestionExecutionPlan,
  serializeAnswerSuggestionBatch,
  suggestUnverifiedAnswersWithTelemetry,
  type AnswerSuggestionBatchResult
} from "@/src/ai/openai-answer-suggester.server";
import { suggestionBatchHash } from "@/src/ai/answer-suggestion-plan";
import {
  AnswerSuggestionErrorResponseSchema,
  AnswerSuggestionExecutionResultSchema,
  AnswerSuggestionPreflightResponseSchema
} from "@/src/ai/answer-suggestion-contract";
import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getServerEnvironment } from "@/src/config/server-env";

const InputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128),
    confirmedPlanHash: z.string().length(64).optional()
  })
  .strict();
const DraftRowSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  document_ir_id: z.string().min(1),
  payload: z.unknown()
});
const CasRowSchema = z.object({ new_revision: z.number().int().positive() });
const TelemetrySchema = z
  .object({
    latencyMs: z.number().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    costUsd: z.number().nonnegative().nullable(),
    costStatus: z.enum(["reported", "unavailable"])
  })
  .strict();
const ClaimSchema = z.object({
  claim_status: z.enum(["claimed", "completed", "in_progress"]),
  claim_token: z.uuid().nullable(),
  suggestion_payload: z.unknown().nullable(),
  telemetry_payload: z.unknown().nullable()
});

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const context = await loadSuggestionContext((await params).runId);
    return NextResponse.json(
      AnswerSuggestionPreflightResponseSchema.parse({
        runId: context.runId,
        revision: context.row.revision,
        model: context.environment.OPENAI_MODEL,
        preflight: context.plan.preflight
      })
    );
  } catch (error) {
    return suggestionErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const input = InputSchema.parse(await request.json());
    const context = await loadSuggestionContext(runId);
    if (context.row.revision !== input.expectedRevision) return conflict(context.row.revision);
    const preflight = context.plan.preflight;
    if (preflight.answerFieldCount === 0) {
      return suggestionError(
        { code: "NO_MODEL_SUGGESTIONS", message: "Для этого черновика нет новых полей." },
        422
      );
    }
    if (preflight.exceedsHardLimit) {
      return suggestionError(
        {
          code: "SUGGESTION_BUDGET_EXCEEDED",
          message: `Оценка ${preflight.estimatedCostUsd.toFixed(2)} превышает лимит ${preflight.hardLimitUsd.toFixed(2)}. Разбейте материал или заполните ответы вручную.`,
          preflight
        },
        422
      );
    }
    if (preflight.requiresConfirmation && input.confirmedPlanHash !== preflight.planHash) {
      return suggestionError(
        {
          code: "SUGGESTION_CONFIRMATION_REQUIRED",
          message: "Подтвердите рассчитанное число запросов и ориентировочную стоимость.",
          preflight
        },
        409
      );
    }

    const result = await suggestUnverifiedAnswersWithTelemetry({
      apiKey: context.environment.OPENAI_API_KEY as string,
      baseUrl: context.environment.OPENAI_BASE_URL,
      model: context.environment.OPENAI_MODEL,
      draft: context.draft,
      document: context.document,
      excludedAnswerFieldIds: [],
      executeBatch: async ({ batchIndex, batch, execute }) => {
        const serializedBatchInput = serializeAnswerSuggestionBatch(batch);
        const batchHash = suggestionBatchHash(preflight.planHash, batchIndex, serializedBatchInput);
        const claimResult = (await context.supabase.rpc("claim_answer_suggestion_batch", {
          p_run_id: runId,
          p_draft_id: context.row.id,
          p_draft_revision: context.row.revision,
          p_plan_hash: preflight.planHash,
          p_batch_index: batchIndex,
          p_batch_hash: batchHash
        })) as { data: unknown; error: { message: string } | null };
        if (claimResult.error) throw new Error(claimResult.error.message);
        const claim = ClaimSchema.parse(
          Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data
        );
        if (claim.claim_status === "completed") {
          return {
            suggestions: z.array(AnswerSuggestionSchema).parse(claim.suggestion_payload),
            telemetry: TelemetrySchema.parse(claim.telemetry_payload)
          };
        }
        if (claim.claim_status === "in_progress") {
          throw new ModelSuggestionError(
            "MODEL_BATCH_IN_PROGRESS",
            "retriable",
            "Этот batch уже обрабатывается в другой вкладке",
            0
          );
        }
        if (!claim.claim_token) throw new Error("BATCH_CLAIM_TOKEN_MISSING");
        const completed = await execute();
        const completeResult = (await context.supabase.rpc("complete_answer_suggestion_batch", {
          p_run_id: runId,
          p_draft_revision: context.row.revision,
          p_plan_hash: preflight.planHash,
          p_batch_index: batchIndex,
          p_batch_hash: batchHash,
          p_claim_token: claim.claim_token,
          p_suggestions: completed.suggestions,
          p_telemetry: completed.telemetry
        })) as { error: { message: string } | null };
        if (completeResult.error) throw new Error(completeResult.error.message);
        return completed satisfies AnswerSuggestionBatchResult;
      }
    });

    const nextDraft = applyAnswerSuggestions(context.draft, result.suggestions);
    const rpcResult = (await context.supabase.rpc("compare_and_swap_lesson_draft", {
      p_draft_id: context.row.id,
      p_expected_revision: input.expectedRevision,
      p_payload: nextDraft
    })) as { data: unknown; error: { message: string } | null };
    if (rpcResult.error?.message.includes("DRAFT_VERSION_CONFLICT")) {
      return conflict(context.row.revision);
    }
    if (rpcResult.error) throw new Error(rpcResult.error.message);
    const saved = CasRowSchema.parse(
      Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
    );
    await appendSuggestionEvent(context.supabase, context.teacherId, runId, {
      idempotencyKey: input.idempotencyKey,
      planHash: preflight.planHash,
      batchCount: preflight.batchCount,
      estimatedTokens: preflight.estimatedTokens,
      estimatedCostUsd: preflight.estimatedCostUsd,
      actualTokenUsage: result.telemetry.totalTokens,
      actualCostUsd: result.telemetry.costUsd,
      model: context.environment.OPENAI_MODEL,
      suggestionCount: result.suggestions.length,
      latencyMs: result.telemetry.latencyMs
    });
    return NextResponse.json(
      AnswerSuggestionExecutionResultSchema.parse({
        runId,
        revision: saved.new_revision,
        suggestionCount: result.suggestions.length,
        preflight,
        actualCostUsd: result.telemetry.costUsd
      })
    );
  } catch (error) {
    return suggestionErrorResponse(error);
  }
}

async function loadSuggestionContext(runId: string) {
  const { teacher, supabase } = await requireTeacher();
  await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
  const draftResult = await supabase
    .from("lesson_drafts")
    .select("id,revision,document_ir_id,payload")
    .eq("run_id", runId)
    .single();
  if (draftResult.error) throw new Error("DRAFT_NOT_FOUND");
  const row = DraftRowSchema.parse(draftResult.data);
  const documentResult = await supabase
    .from("document_irs")
    .select("payload")
    .eq("id", row.document_ir_id)
    .single();
  if (documentResult.error) throw new Error("DOCUMENT_IR_NOT_FOUND");
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) throw new Error("MODEL_NOT_CONFIGURED");
  const draft = ReviewDraftSchema.parse(row.payload);
  const document = DocumentIRSchema.parse(documentResult.data.payload);
  const plan = createAnswerSuggestionExecutionPlan({
    model: environment.OPENAI_MODEL,
    draftRevision: row.revision,
    draft,
    document,
    excludedAnswerFieldIds: [],
    estimatedUsdPer1kTokens: environment.ANSWER_SUGGESTION_ESTIMATED_USD_PER_1K_TOKENS,
    hardLimitUsd: environment.ANSWER_SUGGESTION_HARD_LIMIT_USD
  });
  return { runId, teacherId: teacher.id, supabase, row, environment, draft, document, plan };
}

function suggestionErrorResponse(error: unknown) {
  if (error instanceof UnauthenticatedError)
    return suggestionError({ code: "UNAUTHENTICATED" }, 401);
  if (error instanceof ResourceNotOwnedError) return suggestionError({ code: "NOT_FOUND" }, 404);
  if (error instanceof z.ZodError)
    return suggestionError({ code: "INVALID_SUGGESTION_REQUEST" }, 400);
  if (error instanceof ModelSuggestionError)
    return suggestionError(
      { code: error.code, message: suggestionFailureMessage(error) },
      error.code === "MODEL_BATCH_IN_PROGRESS" ? 409 : error.kind === "retriable" ? 503 : 502
    );
  if (error instanceof Error && error.message === "MODEL_NOT_CONFIGURED")
    return suggestionError(
      { code: "MODEL_NOT_CONFIGURED", message: "ИИ-подсказки сейчас не настроены." },
      503
    );
  return suggestionError({ code: "SUGGESTION_FAILED" }, 500);
}

function suggestionFailureMessage(error: ModelSuggestionError): string {
  if (error.code === "MODEL_BATCH_IN_PROGRESS")
    return "Подсказки уже обрабатываются в другой вкладке. Подождите и обновите страницу.";
  if (error.code === "MODEL_NETWORK_FAILURE")
    return "Не удалось установить защищённое соединение с API модели. Завершённые части сохранены; повторите запрос.";
  if (error.code === "MODEL_OUTPUT_INVALID")
    return "Модель вернула неполный набор ответов. Завершённые части сохранены; повторный запрос продолжит с контрольной точки.";
  if (error.code === "MODEL_EVIDENCE_VIOLATION")
    return "Ответ модели не соответствует полям этого черновика. Продолжите ручную проверку.";
  if (error.code === "MODEL_HTTP_FAILURE") {
    const status = /status (\d{3})/.exec(error.message)?.[1];
    return status
      ? `API модели отклонил запрос (HTTP ${status}). Завершённые части сохранены.`
      : "API модели отклонил запрос. Завершённые части сохранены.";
  }
  return "ИИ-подсказки получить не удалось. Завершённые части сохранены.";
}

function conflict(currentRevision: number) {
  return suggestionError(
    {
      code: "DRAFT_VERSION_CONFLICT",
      message: "Черновик изменён. Перезагрузите страницу.",
      currentRevision
    },
    409
  );
}

function suggestionError(payload: unknown, status: number) {
  return NextResponse.json(AnswerSuggestionErrorResponseSchema.parse(payload), { status });
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
