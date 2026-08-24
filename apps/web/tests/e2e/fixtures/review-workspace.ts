import type { Page } from "@playwright/test";

export const FIXTURE_REVIEW_RUN_ID = "run-e2e-review";
export const FIXTURE_PUBLISH_RUN_ID = "run-e2e-publish";
export const FIXTURE_LESSON_ID = "lesson-e2e-versioned";
export const FIXTURE_PUBLIC_LESSON_ID = "e2e_public_lesson_0001";

const sourceRef = {
  sourceDocumentId: "source-e2e",
  documentIrId: "ir-e2e",
  blockId: "block-e2e",
  pageIndex: 0
};

export const reviewWorkspaceFixture = {
  runId: FIXTURE_REVIEW_RUN_ID,
  status: "awaiting_review",
  currentStep: "wait-for-review",
  failure: null,
  source: { title: "English practice", signedUrl: null },
  draft: {
    id: "draft-e2e",
    revision: 1,
    payload: {
      schemaVersion: "1.0.0",
      title: "English practice",
      sourceDocumentId: "source-e2e",
      documentIrId: "ir-e2e",
      groups: [
        {
          id: "group-e2e",
          ordinal: 1,
          instruction: "Complete",
          provenance: { sourceRefs: [sourceRef] },
          exercises: [
            {
              id: "exercise-e2e",
              ordinal: 1,
              interactionKind: "bracketGap",
              prompt: "She ___ to school every day.",
              provenance: { sourceRefs: [sourceRef] },
              options: [],
              answerFields: [
                {
                  id: "answer-e2e",
                  acceptedValues: ["goes"],
                  provenance: "modelInferred",
                  reviewStatus: "needsReview",
                  confidence: 0.9,
                  evidence: { sourceRefs: [sourceRef] }
                }
              ]
            }
          ]
        }
      ],
      coverage: {
        entries: [],
        detectedCandidateCount: 1,
        accountedCandidateCount: 1,
        unsupportedAdditionCount: 0,
        status: "needsReview"
      }
    }
  },
  documentIr: {
    schemaVersion: "1.0.0",
    id: "ir-e2e",
    sourceDocumentId: "source-e2e",
    pages: [{ index: 0, width: 600, height: 800 }],
    blocks: [
      {
        id: "block-e2e",
        pageIndex: 0,
        kind: "text",
        rawText: "She ___ to school every day.",
        order: 0
      }
    ],
    warnings: []
  },
  issues: [
    {
      id: "issue-e2e",
      code: "ANSWER_UNVERIFIED",
      severity: "blocking",
      resolution: "open",
      message: "Confirm the suggested answer",
      entityIds: ["answer-e2e"],
      evidence: [sourceRef]
    }
  ],
  events: []
} as const;

export async function mockReviewWorkspace(page: Page) {
  await page.route(`**/api/imports/${FIXTURE_REVIEW_RUN_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reviewWorkspaceFixture)
    })
  );
}
