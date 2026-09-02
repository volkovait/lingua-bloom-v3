import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("paid-model checkpoint migration", () => {
  test("scopes exact answer batches without blocking identical batches in another run", async () => {
    const sql = await readMigration();
    expect(sql).toContain("unique (owner_id, run_id, draft_revision, plan_hash, batch_index)");
    expect(sql).not.toContain("unique (owner_id, batch_hash)");
    expect(sql).toContain("owner_id = auth.uid()");
    expect(sql).toContain("and revision = p_draft_revision");
    expect(sql).toContain("claim_token = p_claim_token");
    expect(sql).toContain("BATCH_CLAIM_NOT_FOUND_OR_STALE");
  });

  test("retains answer and layout AI checkpoints with owner-scoped RLS", async () => {
    const sql = await readMigration();
    expect(sql).toContain("retainForProvenance: retained indefinitely");
    expect(sql).toContain("create table public.layout_classification_checkpoints");
    expect(sql).toContain("create policy layout_classification_checkpoints_owner_select");
    expect(sql).toContain("claim_layout_classification");
    expect(sql).toContain("complete_layout_classification");
    expect(sql).not.toMatch(
      /delete\s+from\s+public\.(answer_suggestion_batches|layout_classification_checkpoints)/iu
    );
  });

  test("uses advisory locks, expiring leases and generation tokens for stale-claim safety", async () => {
    const sql = await readMigration();
    expect(sql.match(/pg_advisory_xact_lock/gu)).toHaveLength(2);
    expect(sql.match(/now\(\) \+ interval '2 minutes'/gu)).toHaveLength(4);
    expect(sql).toContain("v_claim_token uuid := gen_random_uuid()");
    expect(sql).toContain("LAYOUT_CLASSIFICATION_CLAIM_NOT_FOUND_OR_STALE");
    expect(sql).not.toMatch(/\bas \$\s*\n/iu);
    expect(sql).not.toMatch(/\n\$;\s*(?:\n|$)/u);
  });
});

function readMigration() {
  return readFile(
    resolve(process.cwd(), "supabase/migrations/0019_answer_suggestion_cost_safety.sql"),
    "utf8"
  );
}
