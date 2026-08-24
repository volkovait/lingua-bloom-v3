import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("teacher answer review UI contract", () => {
  test("keeps every answer editable and requires every model suggestion to be confirmed", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/components/review/exercise-draft-editor.tsx"),
      "utf8"
    );
    expect(source).toContain("exercise.answerFields.map");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain(
      'field.provenance === "modelInferred" && !confirmedSuggestions[field.id]'
    );
    expect(source).toContain("aria-expanded");
    expect(source).toContain("Подтвердить все ИИ-ответы");
    expect(source).toContain("Подтвердить ИИ-ответы этого задания");
    expect(source).toContain("Подтвердите все ответы, предложенные ИИ");
    expect(source).toContain("answerReviews");
  });

  test("review API persists confirmed and edited answers as teacherSupplied", async () => {
    const [route, transformation] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/api/imports/[runId]/review/route.ts"), "utf8"),
      readFile(resolve(process.cwd(), "apps/web/src/review/apply-answer-review.ts"), "utf8")
    ]);
    expect(route).toContain("answerReviews");
    expect(route).toContain("applyTeacherAnswerReview");
    expect(transformation).toContain('provenance: "teacherSupplied"');
    expect(transformation).toContain('reviewStatus: "verified"');
    expect(transformation).toContain("reviewDecisionIds: [decisionId]");
  });
});
