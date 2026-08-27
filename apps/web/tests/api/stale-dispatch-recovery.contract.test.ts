import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const read = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

describe("stale dispatch recovery contract", () => {
  test("atomically records accepted before the first dispatch", async () => {
    const migration = await read("supabase/migrations/0012_stale_dispatch_recovery.sql");
    expect(migration).toContain("create or replace function public.bind_import_run");
    expect(migration).toContain("'accepted'");
    expect(migration).toContain("insert into public.run_events");
    expect(migration.indexOf("insert into public.run_events")).toBeLessThan(
      migration.indexOf("return query select v_run.id")
    );
  });

  test("claims only stale accepted/processing runs without a draft", async () => {
    const migration = await read("supabase/migrations/0012_stale_dispatch_recovery.sql");
    expect(migration).toContain("claim_stale_import_dispatch");
    expect(migration).toContain("interval '30 seconds'");
    expect(migration).toContain("interval '3 minutes'");
    expect(migration).toContain("DISPATCH_NOT_STALE");
    expect(migration).toContain("DISPATCH_NOT_ALLOWED");
    expect(migration).toContain("from public.lesson_drafts");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  test("keeps redispatch owner-scoped and idempotent", async () => {
    const [migration, route] = await Promise.all([
      read("supabase/migrations/0012_stale_dispatch_recovery.sql"),
      read("apps/web/app/api/imports/[runId]/dispatch/route.ts")
    ]);
    expect(migration).toContain("unique (owner_id, idempotency_key)");
    expect(migration).toContain("v_existing.run_id <> p_run_id");
    expect(migration).toContain("enable row level security");
    expect(route).toContain("requireOwnedResource");
    expect(route).toContain('rpc("claim_stale_import_dispatch"');
    expect(route).toContain("redispatch:${claim.dispatch_request_id}");
    expect(route).toContain("replayed");
  });

  test("exposes recovery without leaking an infinite polling state", async () => {
    const [statusRoute, workspace, polling, openapi] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/route.ts"),
      read("apps/web/components/review/review-workspace.tsx"),
      read("apps/web/src/review/polling-policy.ts"),
      read("specs/001-reliable-source-ingestion/contracts/openapi.yaml")
    ]);
    expect(statusRoute).toContain("getStaleRunRecovery");
    expect(statusRoute).toContain("updatedAt: run.updated_at");
    expect(statusRoute).toContain("recovery,");
    expect(workspace).toContain("Повторно запустить обработку");
    expect(workspace).toContain("Последнее обновление:");
    expect(polling).toContain("!state.recovery");
    expect(openapi).toContain("/api/imports/{runId}/dispatch:");
    expect(openapi).toContain("StaleRunRecovery:");
    expect(openapi).toContain(
      "required: [runId, status, currentStep, lastSuccessfulCheckpoint, updatedAt, recovery, failure, source, draft, documentIr, issues, events]"
    );
  });
});
