import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("student attempt migration contract", () => {
  test("keeps attempts immutable and indefinitely retained", async () => {
    const sql = await read("supabase/migrations/0017_student_attempt_grading.sql");
    expect(sql).toContain("student_attempts_immutable");
    expect(sql).toContain("student_attempt_responses_immutable");
    expect(sql).not.toMatch(/expires_at|delete_student_attempt|retention_job/iu);
    expect(sql).toContain("on delete restrict");
  });

  test("uses service-only atomic idempotency, outbox claim and rate limiting", async () => {
    const sql = await read("supabase/migrations/0017_student_attempt_grading.sql");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("attempt_id uuid not null unique");
    expect(sql).toContain("claim_telegram_delivery");
    expect(sql).toContain("claim_student_attempt_rate_limit");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("enable row level security");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
