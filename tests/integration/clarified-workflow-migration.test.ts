import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("clarified workflow migration", () => {
  test("removes retrying and constrains manual continuation", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0005_clarified_workflow.sql"),
      "utf8"
    );
    const finalStatusConstraint = sql.slice(
      sql.lastIndexOf("add constraint pipeline_runs_status_check")
    );
    expect(finalStatusConstraint).not.toContain("'retrying'");
    expect(sql).toContain("last_successful_checkpoint");
    expect(sql).toContain("manual_resume_allowed = (failure_kind = 'retriable')");
    expect(sql).toContain("status <> 'failed'");
  });

  test("adds monotonic atomic draft compare-and-swap", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0005_clarified_workflow.sql"),
      "utf8"
    );
    expect(sql).toContain("rename column draft_version to revision");
    expect(sql).toContain("compare_and_swap_lesson_draft");
    expect(sql).toContain("revision = d.revision + 1");
    expect(sql).toContain("DRAFT_VERSION_CONFLICT");
  });
});
