import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

async function read(path: string) {
  return readFile(resolve(root, path), "utf8");
}

describe("answer suggestion cost safety contract", () => {
  test("requires free preflight and a confirmed immutable plan before large paid runs", async () => {
    const [route, editor, unknownLayout] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/suggest-answers/route.ts"),
      read("apps/web/components/review/exercise-draft-editor.tsx"),
      read("apps/web/components/review/unknown-layout-review.tsx")
    ]);
    expect(route).toContain("export async function GET");
    expect(route).toContain("SUGGESTION_CONFIRMATION_REQUIRED");
    expect(route).toContain("confirmedPlanHash");
    expect(route).toContain("SUGGESTION_BUDGET_EXCEEDED");
    expect(editor).toContain("Платных запросов");
    expect(editor).toContain("Ориентировочная стоимость");
    expect(editor).toContain("Запрос к модели отменён. Деньги не списывались.");
    expect(unknownLayout).not.toContain("/suggest-answers");
  });

  test("persists owner-scoped batch checkpoints and claims each batch atomically", async () => {
    const migration = await read("supabase/migrations/0019_answer_suggestion_cost_safety.sql");
    expect(migration).toContain("create table public.answer_suggestion_batches");
    expect(migration).toContain(
      "unique (owner_id, run_id, draft_revision, plan_hash, batch_index)"
    );
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("owner_id = auth.uid()");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("claim_answer_suggestion_batch");
    expect(migration).toContain("complete_answer_suggestion_batch");
    expect(migration).toContain("status = 'completed'");
  });

  test("validates runtime responses against strict schemas mirrored in OpenAPI", async () => {
    const [route, runtimeContract, openapi] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/suggest-answers/route.ts"),
      read("apps/web/src/ai/answer-suggestion-contract.ts"),
      read("specs/002-universal-pdf-extraction/contracts/openapi.yaml")
    ]);
    expect(route).toContain("AnswerSuggestionPreflightResponseSchema.parse");
    expect(route).toContain("AnswerSuggestionExecutionResultSchema.parse");
    expect(route).toContain("AnswerSuggestionErrorResponseSchema.parse");
    expect(runtimeContract).toContain(".strict()");
    expect(openapi).toContain("AnswerSuggestionExecutionResult:");
    expect(openapi).toContain("AnswerSuggestionError:");
  });

  test("offers checkpointed AI layout suggestions only after a RUB confirmation", async () => {
    const [route, editor, migration] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/layout-review/suggest/route.ts"),
      read("apps/web/components/review/unknown-layout-review.tsx"),
      read("supabase/migrations/0019_answer_suggestion_cost_safety.sql")
    ]);
    expect(route).toContain("confirmedPlanHash");
    expect(route).toContain("claim_layout_classification");
    expect(editor).toContain("Примерная стоимость");
    expect(editor).toContain("₽");
    expect(editor).toContain("ИИ только предложит варианты");
    expect(migration).toContain("layout_classification_checkpoints");
  });

  test("never performs paid answer suggestions during automatic ingestion", async () => {
    const ingestion = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(ingestion).not.toContain("suggestUnverifiedAnswersWithTelemetry({");
    expect(ingestion).toContain("model-answer-suggestions-await-teacher");
    expect(ingestion).toContain("teacher_confirmation_required");
  });
});
