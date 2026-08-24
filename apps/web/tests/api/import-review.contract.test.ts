import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("import review API contract", () => {
  test("defines exhaustive public statuses and manual failure lifecycle", async () => {
    const openapi = await read("specs/001-reliable-source-ingestion/contracts/openapi.yaml");
    for (const status of ["blocked", "failed", "awaiting_review", "ready_to_publish"]) {
      expect(openapi).toContain(status);
    }
    expect(openapi).toContain("manualResumeAllowed");
    expect(openapi).toContain("enum: [retriable, terminal]");
    expect(openapi).not.toMatch(/\bretrying\b/);
    expect(openapi).not.toContain("nextAttemptAt");
  });

  test("enforces auth, ownership, optimistic revision and teacher answer provenance", async () => {
    const route = await read("apps/web/app/api/imports/[runId]/review/route.ts");
    expect(route).toContain("requireTeacher");
    expect(route).toContain("requireOwnedResource");
    expect(route).toContain("DRAFT_VERSION_CONFLICT");
    expect(route).toContain("p_expected_revision");
    expect(route).toContain("applyTeacherAnswerReview");
    expect(route).toContain("answerReviews");
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
