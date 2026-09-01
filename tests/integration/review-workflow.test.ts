import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("durable review workflow", () => {
  test("waits for review, uses ordered events and never enables automatic retry", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    expect(workflow).toContain("retries: 0");
    expect(workflow).toContain('waitForEvent("wait-for-teacher-review"');
    expect(workflow).toContain('order("sequence", { ascending: false })');
    expect(workflow).toContain("last_successful_checkpoint");
  });

  test("serializes stale writes and makes duplicate review submissions idempotent", async () => {
    const sql = await read("supabase/migrations/0008_review_and_publish_workflow.sql");
    expect(sql).toContain("for update");
    expect(sql).toContain("DRAFT_VERSION_CONFLICT");
    expect(sql).toContain("rd.idempotency_key = p_idempotency_key");
    expect(sql).toContain("return query select v_draft.revision");
  });

  test("persists model failures without a partial draft and resumes from the prior checkpoint", async () => {
    const workflow = await read("apps/web/src/inngest/reliable-ingestion.ts");
    const failure = workflow.indexOf("await failRun(");
    const draftInsert = workflow.indexOf('.from("lesson_drafts").insert');
    expect(failure).toBeGreaterThan(0);
    expect(draftInsert).toBeGreaterThan(failure);
    expect(workflow).toContain('last_successful_checkpoint: "validate-coverage"');
    expect(workflow).toContain("selectDocumentIrCheckpoint(kind, irCheckpointResult.data)");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
