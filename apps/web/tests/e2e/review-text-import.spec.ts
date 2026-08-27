import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_REVIEW_RUN_ID } from "./fixtures/review-workspace";

test("text review preserves teacher mutations across reload and reaches publish readiness", async ({
  page
}) => {
  const workspace = textWorkspace();
  const submissions: ReviewSubmission[] = [];
  await routeStatefulReview(page, workspace, submissions);

  await page.goto("/imports/" + FIXTURE_REVIEW_RUN_ID + "/review");
  await expect(page.getByRole("heading", { name: "Исходный текст" })).toBeVisible();
  await expect(page.locator(".text-source-frame")).toContainText("1. She (to go)");
  await expect(page.getByRole("heading", { name: "Предпросмотр PDF" })).toHaveCount(0);

  await page.getByRole("button", { name: "Добавить задание" }).click();
  await page.getByLabel("Формулировка нового задания").fill("They ___ ready.");
  await page.getByLabel("Правильные ответы, по одному полю на строку").fill("are");
  await page.getByRole("button", { name: "Подтвердить и сохранить ответы" }).click();
  await expect(page.getByText("Решения сохранены как ответы преподавателя.")).toBeVisible();
  await page.reload();
  await expect(page.locator("article").filter({ hasText: "They ___ ready." })).toBeVisible();

  const original = page.locator("article").filter({ hasText: "She (to go) to school." });
  if ((await original.getAttribute("class"))?.includes("is-expanded") !== true) {
    await original.locator(".exercise-card-toggle").click();
  }
  await original.getByRole("button", { name: "Удалить задание" }).click();
  await page.getByRole("button", { name: "Подтвердить и сохранить ответы" }).click();
  await page.reload();

  await expect(page.locator("article").filter({ hasText: "She (to go) to school." })).toHaveCount(
    0
  );
  await expect(page.locator(".text-source-frame")).toContainText("She (to go) to school.");
  await expect(page.locator("article").filter({ hasText: "They ___ ready." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Перейти к публикации" })).toBeVisible();
  expect(submissions.map((submission) => submission.draftVersion)).toEqual([1, 2]);
  expect(submissions[0]?.exerciseCreates[0]?.answerValues).toEqual(["are"]);
  expect(submissions[1]?.exerciseDeletes[0]?.exerciseId).toBe("text-exercise-1");
});

interface ReviewSubmission {
  draftVersion: number;
  exerciseCreates: {
    groupId: string;
    prompt: string;
    interactionKind: "inlineGap";
    options: string[];
    answerValues: string[];
  }[];
  exerciseDeletes: { exerciseId: string; reason: string }[];
}

async function routeStatefulReview(
  page: Page,
  workspace: ReturnType<typeof textWorkspace>,
  submissions: ReviewSubmission[]
) {
  const statusUrl = "**/api/imports/" + FIXTURE_REVIEW_RUN_ID;
  await page.route(statusUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workspace)
    })
  );
  await page.route(statusUrl + "/review", async (route) => {
    const submission = route.request().postDataJSON() as ReviewSubmission;
    submissions.push(submission);
    const group = workspace.draft.payload.groups[0];
    if (!group) throw new Error("Text fixture group is missing");
    for (const creation of submission.exerciseCreates) {
      group.exercises.push({
        id: "teacher-exercise-2",
        ordinal: group.exercises.length + 1,
        interactionKind: creation.interactionKind,
        prompt: creation.prompt,
        provenance: { sourceRefs: group.provenance.sourceRefs },
        options: [],
        answerFields: creation.answerValues.map((value, index) => ({
          id: "teacher-exercise-2:answer:" + String(index + 1),
          acceptedValues: [value],
          provenance: "teacherSupplied",
          reviewStatus: "verified",
          evidence: { reviewDecisionIds: ["decision-create-2"] }
        }))
      });
    }
    for (const deletion of submission.exerciseDeletes) {
      group.exercises = group.exercises.filter((exercise) => exercise.id !== deletion.exerciseId);
      group.exercises.forEach((exercise, index) => {
        exercise.ordinal = index + 1;
      });
    }
    workspace.draft.revision += 1;
    workspace.status = "ready_to_publish";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: workspace.draft.revision })
    });
  });
}

function textWorkspace() {
  const sourceRef = {
    sourceDocumentId: "text-source-e2e",
    documentIrId: "text-ir-e2e",
    blockId: "text-block-e2e",
    pageIndex: null
  };
  return {
    runId: FIXTURE_REVIEW_RUN_ID,
    status: "awaiting_review",
    currentStep: "wait-for-review",
    updatedAt: "2026-08-26T12:00:00.000Z",
    recovery: null,
    failure: null,
    source: { title: "Raw text practice", kind: "text", signedUrl: null },
    draft: {
      id: "text-draft-e2e",
      revision: 1,
      payload: {
        schemaVersion: "1.1.0",
        title: "Raw text practice",
        sourceDocumentId: "text-source-e2e",
        documentIrId: "text-ir-e2e",
        groups: [
          {
            id: "text-group-1",
            ordinal: 1,
            instruction: "Open the brackets",
            provenance: { sourceRefs: [sourceRef] },
            exercises: [
              {
                id: "text-exercise-1",
                ordinal: 1,
                interactionKind: "bracketGap",
                prompt: "She (to go) to school.",
                provenance: { sourceRefs: [sourceRef] },
                options: [],
                answerFields: [
                  {
                    id: "text-answer-1",
                    acceptedValues: ["goes"],
                    provenance: "teacherSupplied",
                    reviewStatus: "verified",
                    evidence: { reviewDecisionIds: ["decision-answer-1"] }
                  }
                ]
              }
            ]
          }
        ],
        coverage: {
          entries: [
            {
              candidateId: "text-exercise-1",
              outcome: { kind: "exercise", exerciseIds: ["text-exercise-1"] }
            }
          ],
          detectedCandidateCount: 1,
          accountedCandidateCount: 1,
          unsupportedAdditionCount: 0,
          status: "passed"
        }
      }
    },
    documentIr: {
      schemaVersion: "1.0.0",
      id: "text-ir-e2e",
      sourceDocumentId: "text-source-e2e",
      pages: [],
      blocks: [
        {
          id: "text-block-e2e",
          pageIndex: null,
          kind: "text",
          rawText: "1. She (to go) to school.",
          order: 0
        }
      ],
      warnings: []
    },
    issues: [],
    events: []
  };
}
