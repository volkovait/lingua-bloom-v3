import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("publish transaction invariants", () => {
  test("locks run/draft, rejects stale or duplicate publication and atomically advances latest", async () => {
    const sql = await read("supabase/migrations/0009_publish_public_id_pgcrypto_repair.sql");
    expect(sql).toContain("for update");
    expect(sql).toContain("DRAFT_VERSION_CONFLICT");
    expect(sql).toContain("PUBLISH_BLOCKED");
    expect(sql).toContain("insert into public.lesson_versions");
    expect(sql).toContain("current_published_version_id = v_version.id");
  });

  test("keeps published versions immutable at storage level", async () => {
    const sql = await read("supabase/migrations/0002_ingestion_rls.sql");
    expect(sql).toContain("lesson_versions_immutable");
    expect(sql).toContain("before update or delete on public.lesson_versions");
  });

  test("publish code reruns answer and SourceRef lineage gates", async () => {
    const source = await read("packages/lesson-pipeline/src/publish-version.ts");
    expect(source).toContain('answer.reviewStatus !== "verified"');
    expect(source).toContain("validateLineage(draft, input.document)");
    expect(source).toContain("PublicationBlockedError");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
