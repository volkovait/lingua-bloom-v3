import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildPdfDocumentIr } from "@lingua-bloom/document-ingestion";
import { extractPdfExercises } from "@lingua-bloom/exercise-extraction";
import { createPublishedLessonSpec, projectStudentLesson } from "@lingua-bloom/lesson-pipeline";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { LessonRenderer } from "../../components/lesson/lesson-renderer";
import {
  ANSWER_SUGGESTION_PROMPT_VERSION,
  applyAnswerSuggestions,
  suggestUnverifiedAnswers
} from "./openai-answer-suggester";
import { buildReviewDraft } from "../imports/build-review-draft";

const liveEnabled = process.env.RUN_LIVE_OPENAI === "1";
const MIN_ANSWER_ACCURACY = 0.9;
const PREVIOUS_BASELINE = {
  promptVersion: "answer-suggestions/1.0.0",
  correctAnswerFields: 28,
  answerAccuracy: 28 / 34
} as const;

interface GoldenItem {
  readonly itemNumber: number;
  readonly acceptedValues?: readonly string[];
  readonly canonicalAnswer?: string;
}

interface GoldenManifest {
  readonly summary: { readonly answerableItemCount: number };
  readonly groups: readonly {
    readonly exerciseNumber: number;
    readonly interactionKind: string;
    readonly items: readonly GoldenItem[];
  }[];
}

test.skipIf(!liveEnabled)(
  "converts the real golden PDF through model review into student-safe HTML",
  async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live eval");
    const root = resolve(import.meta.dirname, "../../../..");
    const documentIrId = "ir:live-openai";
    const sourceDocumentId = "source:live-openai";
    const bytes = new Uint8Array(
      await readFile(resolve(root, "tests/fixtures/sources/1_page.pdf"))
    );
    const golden = JSON.parse(
      await readFile(resolve(root, "tests/golden/1_page.expected.json"), "utf8")
    ) as GoldenManifest;
    const document = await buildPdfDocumentIr(bytes, { id: documentIrId, sourceDocumentId });
    const extraction = extractPdfExercises(document, { documentIrId });
    const draft = buildReviewDraft(
      "Golden PDF live model eval",
      sourceDocumentId,
      documentIrId,
      extraction,
      extraction.issues
    );
    const knownAnswerFields = new Set(
      draft.groups.flatMap((group) =>
        group.exercises.flatMap((exercise) => exercise.answerFields.map((answer) => answer.id))
      )
    );

    const suggestions = await suggestUnverifiedAnswers({
      apiKey,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://polza.ai/api/v1",
      model: process.env.OPENAI_MODEL ?? "openai/gpt-5.4-mini",
      draft,
      document
    });

    expect(suggestions.length).toBe(knownAnswerFields.size);
    expect(suggestions.every((suggestion) => knownAnswerFields.has(suggestion.answerFieldId))).toBe(
      true
    );
    const orderedAnswerIds = draft.groups.flatMap((group) =>
      group.exercises.flatMap((exercise) => exercise.answerFields.map((answer) => answer.id))
    );
    const expectedAnswers = golden.groups.flatMap((group) =>
      group.items.map((item) => ({
        exerciseNumber: group.exerciseNumber,
        itemNumber: item.itemNumber,
        interactionKind: group.interactionKind,
        values: item.acceptedValues ?? [item.canonicalAnswer ?? ""]
      }))
    );
    const suggestionsById = new Map(
      suggestions.map((suggestion) => [suggestion.answerFieldId, suggestion.acceptedValues])
    );
    const mismatches: {
      answerFieldId: string;
      exerciseNumber: number;
      itemNumber: number;
      interactionKind: string;
      expected: readonly string[];
      actual: readonly string[];
    }[] = [];
    const correctCount = orderedAnswerIds.reduce((count, answerFieldId, index) => {
      const actual = suggestionsById.get(answerFieldId) ?? [];
      const expected = expectedAnswers[index];
      if (!expected) return count;
      if (matchesAnyExpected(actual, expected.values)) return count + 1;
      mismatches.push({
        answerFieldId,
        exerciseNumber: expected.exerciseNumber,
        itemNumber: expected.itemNumber,
        interactionKind: expected.interactionKind,
        expected: expected.values,
        actual
      });
      return count;
    }, 0);
    const accuracy = correctCount / golden.summary.answerableItemCount;
    const baselinePassed = accuracy >= MIN_ANSWER_ACCURACY;
    if (process.env.UPDATE_EVAL_BASELINE === "1") {
      await writeFile(
        resolve(root, "tests/golden/baseline-report.json"),
        JSON.stringify(
          {
            schemaVersion: "1.0.0",
            fixture: "1_page.pdf",
            model: process.env.OPENAI_MODEL ?? "openai/gpt-5.4-mini",
            promptVersion: ANSWER_SUGGESTION_PROMPT_VERSION,
            normalizationPolicy:
              "NFKC+smart-apostrophe+lowercase-en+terminal-punctuation+whitespace+trim/1.1.0",
            expectedAnswerFields: golden.summary.answerableItemCount,
            returnedAnswerFields: suggestions.length,
            knownIdRate: 1,
            correctAnswerFields: correctCount,
            answerAccuracy: accuracy,
            minimumAnswerAccuracy: MIN_ANSWER_ACCURACY,
            unsupportedExerciseCount: 0,
            passed: baselinePassed,
            comparisonToPreviousBaseline: {
              ...PREVIOUS_BASELINE,
              correctAnswerFieldsDelta: correctCount - PREVIOUS_BASELINE.correctAnswerFields,
              answerAccuracyDelta: accuracy - PREVIOUS_BASELINE.answerAccuracy
            },
            mismatches
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
    }
    expect(accuracy).toBeGreaterThanOrEqual(MIN_ANSWER_ACCURACY);
    const suggestedDraft = applyAnswerSuggestions(draft, suggestions);
    const reviewedDraft = {
      ...suggestedDraft,
      groups: suggestedDraft.groups.map((group) => ({
        ...group,
        exercises: group.exercises.map((exercise) => ({
          ...exercise,
          answerFields: exercise.answerFields.map((answer) => ({
            ...answer,
            provenance: "teacherSupplied" as const,
            reviewStatus: "verified" as const,
            evidence: { reviewDecisionIds: [`decision:${answer.id}`] }
          }))
        }))
      }))
    };
    const lesson = createPublishedLessonSpec({
      lessonId: "lesson:live-openai",
      version: 1,
      draft: reviewedDraft,
      document,
      openBlockingIssueCount: 0,
      unsupportedAdditionCount: 0
    });
    const student = projectStudentLesson(lesson, "abcdefghijklmnopqrstuv");
    const html = renderToStaticMarkup(createElement(LessonRenderer, { lesson: student }));

    expect(html).toContain("Golden PDF live model eval");
    expect(html).toContain("<form");
    expect(html).not.toContain("acceptedValues");
    expect(html).not.toContain("teacherSupplied");
    expect(html).not.toContain("reviewDecisionIds");
  },
  90_000
);

function matchesAnyExpected(actual: readonly string[], expected: readonly string[]) {
  const normalizedExpected = new Set(expected.map(normalizeAnswer));
  return actual.some((value) => normalizedExpected.has(normalizeAnswer(value)));
}

function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/gu, "'")
    .toLocaleLowerCase("en")
    .replace(/[?.!]$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}
