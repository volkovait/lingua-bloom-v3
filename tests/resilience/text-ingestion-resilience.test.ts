import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  ACCEPTED_STALE_AFTER_MS,
  PROCESSING_STALE_AFTER_MS,
  getStaleRunRecovery
} from "../../apps/web/src/imports/stale-run-policy";

describe("text ingestion resilience", () => {
  test("uses the shared durable workflow with no text-specific retry engine", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");

    expect(workflow.match(/createFunction\(/gu)).toHaveLength(1);
    expect(workflow).toContain('kind === "pdf"');
    expect(workflow).toContain("buildTextDocumentIr");
    expect(workflow).toContain("extractTextExercises");
    expect(workflow).toContain("retries: 0");
    expect(workflow).not.toContain("textRetry");
  });

  test("recovers stale text runs through the shared redispatch thresholds", () => {
    const now = Date.parse("2026-08-26T12:00:00.000Z");
    const acceptedUpdatedAt = new Date(now - ACCEPTED_STALE_AFTER_MS).toISOString();
    const processingUpdatedAt = new Date(now - PROCESSING_STALE_AFTER_MS).toISOString();

    expect(
      getStaleRunRecovery(
        { status: "accepted", updatedAt: acceptedUpdatedAt, draftExists: false },
        now
      )
    ).toMatchObject({ kind: "dispatch_not_started", redispatchAllowed: true });
    expect(
      getStaleRunRecovery(
        { status: "processing", updatedAt: processingUpdatedAt, draftExists: false },
        now
      )
    ).toMatchObject({ kind: "worker_heartbeat_expired", redispatchAllowed: true });
    expect(
      getStaleRunRecovery(
        { status: "processing", updatedAt: processingUpdatedAt, draftExists: true },
        now
      )
    ).toBeNull();
  });

  test("reuses checkpoints and makes duplicate delivery harmless for text runs", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");

    expect(workflow).toContain("DocumentIrCheckpointSchema");
    expect(workflow).toContain('if (existing.data) return { status: "awaiting_review"');
    expect(workflow).toContain('error.code !== "23505"');
    expect(workflow).toContain("(latestEvent?.sequence ?? 0) + 1");
  });

  test("shares the owner-only idempotent manual resume contract", async () => {
    const [migration, route] = await Promise.all([
      read("supabase/migrations/0010_idempotent_manual_resume.sql"),
      read("apps/web/app/api/imports/[runId]/resume/route.ts")
    ]);

    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("unique (owner_id, idempotency_key)");
    expect(migration).toContain("failure_kind <> 'retriable'");
    expect(route).toContain("requireTeacher");
    expect(route).toContain("resumedFromCheckpoint");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
