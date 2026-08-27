import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildTextDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractTextExercises } from "@lingua-bloom/exercise-extraction";
import {
  createPublishedLessonSpec,
  evaluateAnswerFieldLimit,
  getPublicationBlockReasons,
  projectStudentLesson
} from "@lingua-bloom/lesson-pipeline";
import { describe, expect, test } from "vitest";

import { buildReviewDraft } from "../../apps/web/src/imports/build-review-draft";
import { applyTeacherAnswerReview } from "../../apps/web/src/review/apply-answer-review";
import { applyExerciseDelete } from "../../apps/web/src/review/apply-exercise-mutations";

interface RawGolden {
  readonly items: readonly {
    readonly itemNumber: number;
    readonly answerFields: readonly { readonly acceptedValues: readonly string[] }[];
  }[];
}

describe("text import workflow integration", () => {
  test("produces workflow-ready artifacts using the shared limits and coverage contract", async () => {
    const raw = await readFile(resolve(process.cwd(), "tests/fixtures/sources/raw.txt"), "utf8");
    const document = buildTextDocumentIr(raw, {
      id: "ir:raw",
      sourceDocumentId: "source:raw"
    });
    const extraction = extractTextExercises(document, { documentIrId: "ir:raw" });
    const answerFieldCount = extraction.groups
      .flatMap((group) => group.exercises)
      .reduce((total, exercise) => total + exercise.answerFields.length, 0);

    expect(evaluateAnswerFieldLimit(answerFieldCount)).toEqual({ allowed: true });
    expect(extraction.coverage).toMatchObject({
      detectedCandidateCount: 18,
      accountedCandidateCount: 18,
      unsupportedAdditionCount: 0,
      status: "needsReview"
    });
    expect(extraction.issues.some((issue) => issue.code === "SOURCE_TRUNCATED")).toBe(true);
  });

  test("reviews the deterministic text draft and publishes a student-safe lesson", async () => {
    const root = resolve(process.cwd());
    const [raw, goldenSource] = await Promise.all([
      readFile(resolve(root, "tests/fixtures/sources/raw.txt"), "utf8"),
      readFile(resolve(root, "tests/golden/raw.expected.json"), "utf8")
    ]);
    const golden = JSON.parse(goldenSource) as RawGolden;
    const document = buildTextDocumentIr(raw, {
      id: "ir:raw-lifecycle",
      sourceDocumentId: "source:raw-lifecycle"
    });
    const extraction = extractTextExercises(document, {
      documentIrId: document.id
    });
    let draft = buildReviewDraft(
      "Raw text lifecycle",
      document.sourceDocumentId,
      document.id,
      extraction,
      extraction.issues
    );

    draft = applyExerciseDelete(
      draft,
      { exerciseId: "group:1:item:18", reason: "Source is truncated" },
      "decision:exclude:18"
    ).draft;

    const expectedByItem = new Map(
      golden.items.map((item) => [item.itemNumber, item.answerFields])
    );
    for (const exercise of draft.groups.flatMap((group) => group.exercises)) {
      const expected = expectedByItem.get(exercise.ordinal);
      expect(expected).toHaveLength(exercise.answerFields.length);
      for (const [index, field] of exercise.answerFields.entries()) {
        const replacementValue = expected?.[index]?.acceptedValues[0];
        if (!replacementValue) throw new Error(`Missing golden answer for ${field.id}`);
        draft = applyTeacherAnswerReview(
          draft,
          { answerFieldId: field.id, replacementValue },
          `decision:confirm:${field.id}`
        ).draft;
      }
    }

    const readiness = {
      draft,
      document,
      openBlockingIssueCount: 0,
      unsupportedAdditionCount: extraction.coverage.unsupportedAdditionCount
    };
    expect(getPublicationBlockReasons(readiness)).toEqual([]);

    const lesson = createPublishedLessonSpec({
      ...readiness,
      lessonId: "lesson:raw-lifecycle",
      version: 1
    });
    const student = projectStudentLesson(lesson, "raw_lifecycle_public_0001");
    const item17 = student.groups
      .flatMap((group) => group.exercises)
      .find((exercise) => exercise.ordinal === 17);
    const serialized = JSON.stringify(student);

    expect(item17?.responseFields).toHaveLength(2);
    expect(student.groups.flatMap((group) => group.exercises)).toHaveLength(17);
    expect(serialized).not.toContain("acceptedValues");
    expect(serialized).not.toContain("teacherSupplied");
    expect(serialized).not.toContain("reviewDecisionIds");
  });

  test("the durable workflow no longer has a text-not-implemented terminal branch", async () => {
    const workflow = await readFile(
      resolve(process.cwd(), "apps/web/src/inngest/reliable-ingestion.ts"),
      "utf8"
    );
    expect(workflow).not.toContain("TEXT_PIPELINE_NOT_IMPLEMENTED");
    expect(workflow).toContain("extractTextExercises");
    expect(workflow).toContain("ARTIFACT_VERSIONS.textParser");
  });
});
