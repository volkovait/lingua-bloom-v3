import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("review and publish transaction migration", () => {
  test("uses locks, optimistic revision and append-only decisions", async () => {
    const sql = await migration();
    expect(sql).toContain("for update");
    expect(sql).toContain("DRAFT_VERSION_CONFLICT");
    expect(sql).toContain("insert into public.review_decisions");
    expect(sql).not.toContain("update public.review_decisions");
    expect(sql).not.toContain("delete from public.review_decisions");
  });

  test("generates the capability in Postgres and atomically advances latest", async () => {
    const sql = await migration();
    expect(sql).toContain("gen_random_bytes(16)");
    expect(sql).toContain("insert into public.lesson_versions");
    expect(sql).toContain("current_published_version_id = v_version.id");
    expect(sql).toContain("PERMANENT_PUBLIC_ACCESS_CONFIRMATION_REQUIRED");
    expect(sql).not.toContain("p_public_lesson_id");
  });
});

function migration() {
  return readFile(
    resolve(process.cwd(), "supabase/migrations/0008_review_and_publish_workflow.sql"),
    "utf8"
  );
}
