import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  FIXTURE_LESSON_ID,
  FIXTURE_PUBLIC_LESSON_ID,
  FIXTURE_REVIEW_RUN_ID
} from "./fixtures/review-workspace";

const projectRoot = resolve(process.cwd(), "../..");

test("an authenticated teacher imports text, reviews, publishes, and opens the public lesson", async ({
  context,
  page
}) => {
  const environment = parseEnvironment(await readFile(resolve(projectRoot, ".env.local"), "utf8"));
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    test.skip(true, "Supabase E2E credentials are required");
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = "phase4c-text-" + crypto.randomUUID() + "@example.com";
  const password = "Phase4C-" + crypto.randomUUID() + "-aA1!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createError) throw createError;

  try {
    const jar = new Map<string, string>();
    const auth = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) => {
          values.forEach(({ name, value }) => jar.set(name, value));
        }
      }
    });
    const { error: signInError } = await auth.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    await context.addCookies(
      [...jar].map(([name, value]) => ({ name, value, domain: "127.0.0.1", path: "/" }))
    );

    let importBody = "";
    await page.route("**/api/imports", async (route) => {
      importBody = route.request().postDataBuffer()?.toString("utf8") ?? "";
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          runId: FIXTURE_REVIEW_RUN_ID,
          sourceDocumentId: "text-source-e2e",
          status: "accepted"
        })
      });
    });
    await page.route("**/api/imports/" + FIXTURE_REVIEW_RUN_ID, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readyTextWorkspace())
      })
    );
    await page.route("**/api/imports/" + FIXTURE_REVIEW_RUN_ID + "/publish", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lessonId: FIXTURE_LESSON_ID,
          publicLessonId: FIXTURE_PUBLIC_LESSON_ID,
          version: 2
        })
      })
    );

    await page.goto("/imports/new");
    await page.getByLabel("Название урока").fill("Text browser journey");
    await page.getByLabel("Вставленный текст").fill("1. She (to go) to school.");
    await page.getByRole("button", { name: "Начать импорт" }).click();

    await expect(page).toHaveURL(new RegExp("/imports/" + FIXTURE_REVIEW_RUN_ID + "$"));
    await expect(page.getByRole("heading", { name: "Импорт принят" })).toBeVisible();
    expect(importBody).toContain('name="sourceText"');
    expect(importBody).toContain("1. She (to go) to school.");
    expect(importBody).toContain('name="idempotencyKey"');

    await page.getByRole("link", { name: "Открыть результаты и проверку" }).click();
    await expect(page.getByRole("heading", { name: "Исходный текст" })).toBeVisible();
    await expect(page.locator(".text-source-frame")).toContainText("She (to go) to school.");
    await expect(page.getByText("Урок готов к публикации")).toBeVisible();

    await page.getByRole("link", { name: "Перейти к публикации" }).click();
    await expect(page.getByRole("heading", { name: "Опубликовать урок?" })).toBeVisible();
    await page
      .getByLabel("Я понимаю, что публичная ссылка сохраняет доступ к актуальной версии урока.")
      .check();
    await page.getByRole("button", { name: "Опубликовать версию" }).click();
    await expect(page.getByRole("heading", { name: "Урок опубликован" })).toBeVisible();

    await page.getByRole("link", { name: "Открыть урок" }).click();
    await expect(page).toHaveURL(new RegExp("/learn/" + FIXTURE_PUBLIC_LESSON_ID + "$"));
    await expect(page.getByRole("heading", { name: "English practice · version 2" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
  }
});

function readyTextWorkspace() {
  const sourceRef = {
    sourceDocumentId: "text-source-e2e",
    documentIrId: "text-ir-e2e",
    blockId: "text-block-e2e",
    pageIndex: null
  };
  return {
    runId: FIXTURE_REVIEW_RUN_ID,
    status: "ready_to_publish",
    currentStep: "ready-to-publish",
    lastSuccessfulCheckpoint: "apply-review",
    updatedAt: "2026-08-26T12:00:00.000Z",
    recovery: null,
    failure: null,
    source: { title: "Text browser journey", kind: "text", signedUrl: null },
    draft: {
      id: "text-draft-e2e",
      revision: 2,
      payload: {
        schemaVersion: "1.1.0",
        title: "Text browser journey",
        sourceDocumentId: "text-source-e2e",
        documentIrId: "text-ir-e2e",
        groups: [
          {
            id: "text-group-e2e",
            ordinal: 1,
            instruction: "Open the brackets",
            provenance: { sourceRefs: [sourceRef] },
            exercises: [
              {
                id: "text-exercise-e2e",
                ordinal: 1,
                interactionKind: "bracketGap",
                prompt: "She (to go) to school.",
                provenance: { sourceRefs: [sourceRef] },
                options: [],
                answerFields: [
                  {
                    id: "text-answer-e2e",
                    acceptedValues: ["goes"],
                    provenance: "teacherSupplied",
                    reviewStatus: "verified",
                    evidence: { reviewDecisionIds: ["decision-e2e"] }
                  }
                ]
              }
            ]
          }
        ],
        coverage: {
          entries: [
            {
              candidateId: "text-exercise-e2e",
              outcome: { kind: "exercise", exerciseIds: ["text-exercise-e2e"] }
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

function parseEnvironment(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
}
