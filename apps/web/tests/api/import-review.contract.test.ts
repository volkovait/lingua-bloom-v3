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
    const openapi = await read("specs/001-reliable-source-ingestion/contracts/openapi.yaml");
    expect(route).toContain("requireTeacher");
    expect(route).toContain("requireOwnedResource");
    expect(route).toContain("DRAFT_VERSION_CONFLICT");
    expect(route).toContain("p_expected_revision");
    expect(route).toContain("applyTeacherAnswerReview");
    expect(route).toContain("answerReviews");
    expect(route).toContain("applyExerciseCreate");
    expect(route).toContain("applyExerciseDelete");
    expect(openapi).toContain("exerciseCreates:");
    expect(openapi).toContain("exerciseDeletes:");
  });
  test("keeps the runtime status payload inside the canonical OpenAPI shape", async () => {
    const route = await read("apps/web/app/api/imports/[runId]/route.ts");
    const openapi = await read("specs/001-reliable-source-ingestion/contracts/openapi.yaml");
    const fields = [
      "runId",
      "status",
      "currentStep",
      "lastSuccessfulCheckpoint",
      "updatedAt",
      "recovery",
      "failure",
      "source",
      "draft",
      "documentIr",
      "issues",
      "events"
    ];
    expect(openapi).toContain(`required: [${fields.join(", ")}]`);
    for (const field of fields) {
      expect(route).toMatch(new RegExp(`\\b${field}(?::|,)`));
    }
    expect(openapi).not.toContain("draftId:");
    expect(openapi).toContain("required: [sequence, type, status, step, occurredAt]");
  });

  test("requires at least one review mutation array in OpenAPI", async () => {
    const openapi = await read("specs/001-reliable-source-ingestion/contracts/openapi.yaml");
    for (const mutation of [
      "decisions",
      "answerReviews",
      "exerciseEdits",
      "exerciseCreates",
      "exerciseDeletes"
    ]) {
      expect(openapi).toContain(`- required: [${mutation}]`);
    }
  });
});

function read(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}
