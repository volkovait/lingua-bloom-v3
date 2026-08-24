import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("publish readiness gate migration", () => {
  test("uses server-computed reasons and independently checks persisted blockers", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0011_publish_readiness_gate.sql"),
      "utf8"
    );

    expect(sql).toContain("p_publication_reasons jsonb");
    expect(sql).toContain("v_open_blocking > 0");
    expect(sql).toContain("unsupportedAdditionCount");
    expect(sql).toContain("answers remain unverified");
    expect(sql).toContain("jsonb_array_length(v_reasons) = 0");
  });

  test("the ingestion, review and publish paths use the canonical readiness validator", async () => {
    const [workflow, reviewRoute, publishRoute] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/src/inngest/reliable-ingestion.ts"), "utf8"),
      readFile(resolve(process.cwd(), "apps/web/app/api/imports/[runId]/review/route.ts"), "utf8"),
      readFile(resolve(process.cwd(), "apps/web/app/api/imports/[runId]/publish/route.ts"), "utf8")
    ]);

    expect(workflow).toContain("getPublicationBlockReasons");
    expect(workflow).toContain("publicationReady");
    expect(reviewRoute).toContain("getPublicationBlockReasons");
    expect(reviewRoute).toContain("p_publication_reasons: publicationReasons");
    expect(publishRoute).toContain("createPublishedLessonSpec");
    expect(publishRoute).toContain("reasons: error.reasons");
  });

  test("persistence independently adds every server-verifiable blocker", async () => {
    const sql = await readFile(
      resolve(process.cwd(), "supabase/migrations/0011_publish_readiness_gate.sql"),
      "utf8"
    );
    expect(sql).toContain("v_reasons := v_reasons || '[\"blocking issues remain open\"]'::jsonb");
    expect(sql).toContain("v_reasons := v_reasons || '[\"unsupported additions remain\"]'::jsonb");
    expect(sql).toContain("v_reasons := v_reasons || '[\"answers remain unverified\"]'::jsonb");
    expect(sql).toContain("when jsonb_array_length(v_reasons) = 0 then 'ready_to_publish'");
  });
});
