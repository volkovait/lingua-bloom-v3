import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("public lesson migration", () => {
  test("backfills latest version, is rerunnable, and makes the capability immutable and unique", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0004_public_lesson_access.sql"),
      "utf8"
    );
    expect(sql).toContain("where public_lesson_id is null");
    expect(sql).toContain("lessons_public_lesson_id_unique");
    expect(sql).toContain("lessons_public_id_immutable");
    expect(sql).toContain("current_published_version_id");
    expect(sql).toContain("distinct on (lesson_id)");
    expect(sql).toContain("drop trigger if exists lessons_public_id_immutable");
    expect(sql).toContain("if not exists (");
    expect(sql).not.toContain("alter column public_lesson_id set not null");
  });

  test("repair constrains the latest pointer to the same lesson", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0007_public_lesson_access_repair.sql"),
      "utf8"
    );
    expect(sql).toContain("foreign key (current_published_version_id, id)");
    expect(sql).toContain("references public.lesson_versions(id, lesson_id)");
  });
});
