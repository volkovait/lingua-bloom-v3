import { UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createLayoutAiPreflight,
  LayoutAiErrorSchema,
  LayoutAiPreflightResponseSchema,
  LayoutAiPreflightSchema,
  LayoutAiSuggestionResultSchema,
  LayoutAiSuggestionSchema,
  suggestLayoutClassifications
} from "@/src/ai/layout-review-classifier";
import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { getServerEnvironment } from "@/src/config/server-env";

const InputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    confirmedPlanHash: z.string().length(64)
  })
  .strict();
const ReviewRowSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  payload: z.unknown()
});
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
    const context = await loadContext((await params).runId);
    return NextResponse.json(
      LayoutAiPreflightResponseSchema.parse({
        runId: context.runId,
        revision: context.row.revision,
        model: context.environment.OPENAI_MODEL,
        preflight: context.preflight
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const context = await loadContext((await params).runId);
    const input = InputSchema.parse(await request.json());
    if (input.expectedRevision !== context.row.revision)
      return jsonError(
        "LAYOUT_REVIEW_VERSION_CONFLICT",
        "Решения изменились. Перезагрузите страницу.",
        409
      );
    if (context.preflight.exceedsHardLimit)
      return jsonError(
        "LAYOUT_AI_BUDGET_EXCEEDED",
        `Оценка ${context.preflight.estimatedCostRub.toFixed(2)} ₽ превышает лимит ${context.preflight.hardLimitRub.toFixed(2)} ₽.`,
        422
      );
    if (input.confirmedPlanHash !== context.preflight.planHash)
      return jsonError(
        "LAYOUT_AI_CONFIRMATION_REQUIRED",
        "Подтвердите актуальный план и стоимость.",
        409
      );

    const claimResult = (await context.supabase.rpc("claim_layout_classification", {
      p_run_id: context.runId,
      p_review_id: context.row.id,
      p_review_revision: context.row.revision,
      p_plan_hash: context.preflight.planHash
    })) as { data: unknown; error: { message: string } | null };
    if (claimResult.error) throw new Error(claimResult.error.message);
    const claim = ClaimSchema.parse(
      Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data
    );
    if (claim.claim_status === "in_progress")
      return jsonError(
        "LAYOUT_AI_IN_PROGRESS",
        "Классификация уже выполняется в другой вкладке.",
        409
      );
    if (claim.claim_status === "completed") {
      return NextResponse.json(
        LayoutAiSuggestionResultSchema.parse({
          runId: context.runId,
          revision: context.row.revision,
          preflight: context.preflight,
          suggestions: z.array(LayoutAiSuggestionSchema).parse(claim.suggestion_payload),
          telemetry: claim.telemetry_payload,
          reused: true
        })
      );
    }
    if (!claim.claim_token) throw new Error("LAYOUT_AI_CLAIM_TOKEN_MISSING");

    const result = await suggestLayoutClassifications({
      apiKey: context.environment.OPENAI_API_KEY as string,
      baseUrl: context.environment.OPENAI_BASE_URL,
      model: context.environment.OPENAI_MODEL,
      candidates: context.candidates
    });
    const completeResult = (await context.supabase.rpc("complete_layout_classification", {
      p_run_id: context.runId,
      p_review_revision: context.row.revision,
      p_plan_hash: context.preflight.planHash,
      p_claim_token: claim.claim_token,
      p_suggestions: result.suggestions,
      p_telemetry: result.telemetry
    })) as { error: { message: string } | null };
    if (completeResult.error) throw new Error(completeResult.error.message);

    return NextResponse.json(
      LayoutAiSuggestionResultSchema.parse({
        runId: context.runId,
        revision: context.row.revision,
        preflight: context.preflight,
        suggestions: result.suggestions,
        telemetry: result.telemetry,
        reused: false
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function loadContext(runId: string) {
  const { teacher, supabase } = await requireTeacher();
  await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
  const result = await supabase
    .from("unknown_layout_reviews")
    .select("id,revision,payload")
    .eq("run_id", runId)
    .eq("status", "active")
    .single();
  if (result.error) throw new Error("LAYOUT_REVIEW_NOT_FOUND");
  const row = ReviewRowSchema.parse(result.data);
  const review = UnknownLayoutReviewSchema.parse(row.payload);
  const decided = new Set(review.decisions.map((decision) => decision.candidateId));
  const candidates = review.candidates.filter((candidate) => !decided.has(candidate.id));
  if (candidates.length === 0) throw new Error("NO_LAYOUT_CANDIDATES");
  const environment = getServerEnvironment();
  if (!environment.OPENAI_API_KEY) throw new Error("MODEL_NOT_CONFIGURED");
  const preflight = createLayoutAiPreflight({
    runId,
    revision: row.revision,
    model: environment.OPENAI_MODEL,
    candidates,
    estimatedRubPer1kTokens: environment.LAYOUT_CLASSIFICATION_ESTIMATED_RUB_PER_1K_TOKENS,
    hardLimitRub: environment.LAYOUT_CLASSIFICATION_HARD_LIMIT_RUB
  });
  return {
    runId,
    teacherId: teacher.id,
    supabase,
    row,
    review,
    candidates,
    environment,
    preflight: LayoutAiPreflightSchema.parse(preflight)
  };
}

function errorResponse(error: unknown) {
  if (error instanceof UnauthenticatedError) return jsonError("UNAUTHENTICATED", undefined, 401);
  if (error instanceof ResourceNotOwnedError) return jsonError("NOT_FOUND", undefined, 404);
  if (error instanceof z.ZodError) return jsonError("INVALID_LAYOUT_AI_REQUEST", undefined, 400);
  if (error instanceof Error && error.message === "MODEL_NOT_CONFIGURED")
    return jsonError("MODEL_NOT_CONFIGURED", "ИИ-классификация сейчас не настроена.", 503);
  if (error instanceof Error && error.message === "NO_LAYOUT_CANDIDATES")
    return jsonError("NO_LAYOUT_CANDIDATES", "Все фрагменты уже классифицированы.", 422);
  if (error instanceof Error && error.message.startsWith("LAYOUT_AI_HTTP_"))
    return jsonError(
      "LAYOUT_AI_PROVIDER_FAILED",
      "Провайдер отклонил запрос. Решения учителя не изменены.",
      502
    );
  return jsonError(
    "LAYOUT_AI_FAILED",
    "ИИ-классификацию получить не удалось. Решения учителя не изменены.",
    500
  );
}

function jsonError(code: string, message: string | undefined, status: number) {
  return NextResponse.json(LayoutAiErrorSchema.parse({ code, ...(message ? { message } : {}) }), {
    status
  });
}
