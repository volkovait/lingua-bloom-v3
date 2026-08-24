import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("manual resume contract", () => {
  test("is owner-scoped, atomic and idempotent on the same run/checkpoint", async () => {
    const [route, migration] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/resume/route.ts"),
      read("supabase/migrations/0010_idempotent_manual_resume.sql")
    ]);
    expect(route).toContain("requireOwnedResource");
    expect(route).toContain('rpc("resume_failed_import"');
    expect(route).toContain("resumedFromCheckpoint");
    expect(route).toContain("replayed");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("unique (owner_id, idempotency_key)");
    expect(migration).toContain("v_existing.checkpoint");
  });

  test("rejects terminal/non-failed runs and contains no automatic retry", async () => {
    const [route, migration, workflow] = await Promise.all([
      read("apps/web/app/api/imports/[runId]/resume/route.ts"),
      read("supabase/migrations/0010_idempotent_manual_resume.sql"),
      read("apps/web/src/inngest/reliable-ingestion.ts")
    ]);
    expect(migration).toContain("RESUME_NOT_ALLOWED");
    expect(migration).toContain("failure_kind <> 'retriable'");
    expect(route).toContain("IDEMPOTENCY_KEY_CONFLICT");
    expect(workflow).toContain("retries: 0");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
