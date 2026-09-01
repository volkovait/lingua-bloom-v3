import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("ingestion resilience release matrix", () => {
  test("uses a bounded wait and disables automatic retries", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(workflow).toContain("retries: 0");
    expect(workflow).toContain('timeout: "365d"');
    expect(workflow).not.toMatch(/retries:\s*[1-9]/u);
  });

  test("restart reuses durable IR and draft checkpoints", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(workflow).toContain("selectDocumentIrCheckpoint(kind, irCheckpointResult.data)");
    expect(workflow).toContain('if (existing.data) return { status: "awaiting_review"');
    expect(workflow).toContain('last_successful_checkpoint: "validate-coverage"');
    expect(workflow).toContain('last_successful_checkpoint: "assemble-draft"');
  });

  test("treats the optional model step as atomic best-effort enrichment", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(workflow).toContain("Answer suggestions were skipped");
    expect(workflow).toContain("modelSuggestionOutcome: modelOutcome");
    expect(workflow).toContain("outcome: modelOutcome");
    expect(workflow).toContain('"model-answer-suggestions-skipped"');
    const modelCall = workflow.indexOf("suggestUnverifiedAnswersWithTelemetry({");
    const fallbackStart = workflow.indexOf("} catch (error) {", modelCall);
    const fallbackEnd = workflow.indexOf("} else {", fallbackStart);
    const fallback = workflow.slice(fallbackStart, fallbackEnd);
    const draftInsert = workflow.indexOf('.from("lesson_drafts").insert');
    expect(fallbackStart).toBeGreaterThan(modelCall);
    expect(fallback).not.toContain("await failRun");
    expect(fallback).not.toContain('return { status: "failed"');
    expect(draftInsert).toBeGreaterThan(fallbackEnd);
  });

  test("duplicate events are harmless and event order remains monotonic", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(workflow).toContain('order("sequence", { ascending: false })');
    expect(workflow).toContain("(latestEvent?.sequence ?? 0) + 1");
    expect(workflow).toContain('error.code !== "23505"');
  });

  test("manual resume is atomic, idempotent and safe under double submission", async () => {
    const [migration, route] = await Promise.all([
      read("supabase/migrations/0010_idempotent_manual_resume.sql"),
      read("apps/web/app/api/imports/[runId]/resume/route.ts")
    ]);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("unique (owner_id, idempotency_key)");
    expect(migration).toContain("v_existing.run_id <> p_run_id");
    expect(migration).toContain("v_existing.checkpoint, true");
    expect(migration).toContain("failure_kind <> 'retriable'");
    expect(route).toContain("resumedFromCheckpoint");
    expect(route).toContain("replayed: resumed.replayed");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
