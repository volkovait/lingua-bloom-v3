import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("tenant-isolation migrations", () => {
  test("enable RLS and bind every private table to auth.uid()", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0002_ingestion_rls.sql"),
      "utf8"
    );
    expect(sql.match(/enable row level security/g)?.length).toBe(10);
    expect(sql).toContain("owner_id = auth.uid()");
    expect(sql).toContain("lesson_versions_immutable");
  });

  test("keeps the source bucket private and owner-prefixed", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0003_source_storage.sql"),
      "utf8"
    );
    expect(sql).toContain("'sources', 'sources', false");
    expect(sql).toContain("storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).not.toMatch(/for delete/i);
  });

  test("keeps API ownership checks tenant-scoped and fail-closed", async () => {
    const guard = await readFile(
      resolve(process.cwd(), "apps/web/src/auth/require-owned-resource.ts"),
      "utf8"
    );
    expect(guard).toContain('.select("owner_id")');
    expect(guard).toContain('.eq("id", resourceId)');
    expect(guard).toContain("row.owner_id !== ownerId");
    expect(guard).toContain("throw new ResourceNotOwnedError()");
  });

  test("ships a live database, API, and Storage isolation smoke test", async () => {
    const verifier = await readFile(
      resolve(process.cwd(), "apps/web/scripts/verify-live-phase2.mjs"),
      "utf8"
    );
    expect(verifier).toContain("crossTenantDownloadBlocked");
    expect(verifier).toContain("crossTenantUploadBlocked");
    expect(verifier).toContain("unauthenticatedRejected");
    expect(verifier).toContain("exactReplayStable");
  });

  test("enforces parent ownership and immutable/append-only artifacts", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0006_tenant_immutability.sql"),
      "utf8"
    );
    expect(sql).toContain("foreign key (source_document_id, owner_id)");
    expect(sql).toContain("foreign key (run_id, owner_id)");
    expect(sql).toContain("document_irs_immutable");
    expect(sql).toContain("review_decisions_immutable");
    expect(sql).toContain("run_events_immutable");
    expect(sql).toContain("generation_manifests_immutable");
    expect(sql).not.toMatch(/for all to authenticated/i);
  });
});
