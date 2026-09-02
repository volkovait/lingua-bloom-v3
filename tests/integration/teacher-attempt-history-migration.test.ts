import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("teacher attempt history migration", () => {
  test("adds owner indexes, parameterized list and stale recovery without delete paths", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0018_teacher_attempt_history.sql"),
      "utf8"
    );
    expect(sql).toContain("student_attempts_owner_created_idx");
    expect(sql).toContain("list_teacher_attempts");
    expect(sql).toContain("recover_stale_telegram_deliveries");
    expect(sql).toContain("a.owner_id = p_owner_id");
    expect(sql).not.toMatch(/delete\s+from\s+public\.student_attempts/iu);
  });
});
