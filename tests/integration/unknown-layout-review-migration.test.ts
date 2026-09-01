import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("unknown-layout review migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0015_unknown_layout_review.sql"),
    "utf8"
  );

  it("keeps fallback owner-scoped and mutually exclusive with an active draft", () => {
    expect(sql).toContain("alter table public.unknown_layout_reviews enable row level security");
    expect(sql).toContain("owner_id = auth.uid()");
    expect(sql).toContain("ACTIVE_UNKNOWN_LAYOUT_REVIEW_EXISTS");
    expect(sql).toContain("on delete restrict");
  });

  it("adds atomic revision and idempotency protection for teacher decisions", () => {
    const submissionSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0016_unknown_layout_review_submission.sql"),
      "utf8"
    );
    expect(submissionSql).toContain("unknown_layout_review_submissions_owner_only");
    expect(submissionSql).toContain("LAYOUT_REVIEW_VERSION_CONFLICT");
    expect(submissionSql).toContain("IDEMPOTENCY_CONFLICT");
    expect(submissionSql).toContain("for update");
    expect(submissionSql).toContain("RESOLVED_REVIEW_REQUIRES_DRAFT");
  });
});
