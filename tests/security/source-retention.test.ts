import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("source retention contract", () => {
  test("uses restrictive lineage and has no TTL/deletion columns", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0001_reliable_ingestion.sql"),
      "utf8"
    );
    expect(sql).toContain("retention_policy text not null default 'retainForProvenance'");
    expect(sql).toContain("on delete restrict");
    expect(sql).not.toMatch(/purge_after|expires_at|soft_deleted/i);
  });

  test("blocks direct database deletion of a source", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0002_ingestion_rls.sql"),
      "utf8"
    );
    expect(sql).toContain("source_documents_retained");
    expect(sql).toContain("source documents are retained for provenance");
    const hardening = await readFile(
      resolve(process.cwd(), "supabase/migrations/0006_tenant_immutability.sql"),
      "utf8"
    );
    expect(hardening).toContain("source_documents_immutable_update");
    expect(hardening).not.toMatch(/source_documents_owner_update/);
  });

  test("exposes no source delete API or repository operation", async () => {
    const repository = await readFile(
      resolve(process.cwd(), "packages/document-ingestion/src/source-repository.ts"),
      "utf8"
    );
    const apiFiles = await readFile(
      resolve(process.cwd(), "specs/001-reliable-source-ingestion/contracts/openapi.yaml"),
      "utf8"
    );
    expect(repository).not.toMatch(/\bdelete\s*\(/);
    expect(repository).not.toMatch(/\bremove\s*\(/);
    expect(apiFiles).not.toMatch(/^\s*delete:/m);
  });

  test("keeps source lineage when a lesson receives version 2", async () => {
    const schema = await readFile(
      resolve(process.cwd(), "supabase/migrations/0001_reliable_ingestion.sql"),
      "utf8"
    );
    expect(schema).toContain(
      "source_document_id uuid not null references public.source_documents(id) on delete restrict"
    );
    expect(schema).toContain("unique (lesson_id, version)");
    expect(schema).not.toMatch(/on delete cascade/i);
  });
});
