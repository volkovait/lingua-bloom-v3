import { expect, test } from "@playwright/test";

import {
  FIXTURE_REVIEW_RUN_ID,
  mockReviewWorkspace,
  reviewWorkspaceFixture
} from "./fixtures/review-workspace";

const runId = process.env.E2E_REVIEW_RUN_ID ?? FIXTURE_REVIEW_RUN_ID;
const liveReviewEnabled = Boolean(process.env.E2E_REVIEW_RUN_ID);

test.describe("teacher review journey", () => {
  test.beforeEach(async ({ page }) => {
    if (!liveReviewEnabled) await mockReviewWorkspace(page);
  });

  test("shows only the PDF preview and parsed exercise editor in the review workspace", async ({
    page
  }) => {
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    await expect(page.getByRole("heading", { name: "Предпросмотр PDF" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Извлечённые упражнения" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Проблемы и предупреждения" })).toHaveCount(0);
    await expect(page.getByLabel("Извлечённый текст")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Журнал обработки" })).toHaveCount(0);
  });

  test("keeps the draft editable when optional AI suggestions are skipped", async ({ page }) => {
    await page.unroute(`**/api/imports/${runId}`);
    await page.route(`**/api/imports/${runId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...reviewWorkspaceFixture,
          events: [
            {
              sequence: 3,
              type: "model-answer-suggestions-skipped",
              status: "processing",
              step: "model-answer-suggestions-skipped",
              occurredAt: "2026-08-25T12:18:30.008Z"
            }
          ]
        })
      })
    );
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    await expect(page.getByText("ИИ-подсказки ответов сейчас недоступны")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Извлечённые упражнения" })).toBeVisible();
  });

  test("highlights invalid entities inline without restoring a separate issue panel", async ({
    page
  }) => {
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    const invalidCard = page.locator('[data-validation-severity="blocking"]');
    await expect(invalidCard).toBeVisible();
    await expect(
      invalidCard.getByText("Проблема: Правильный ответ требует подтверждения.")
    ).toBeVisible();
    await expect(page.getByText("Нужно исправить перед публикацией")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Проблемы и предупреждения" })).toHaveCount(0);
  });

  test("removes unverified highlighting immediately when a suggested answer is confirmed", async ({
    page
  }) => {
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    const confirmation = page.getByLabel("Подтверждаю предложенный правильный ответ");

    await expect(page.locator('[data-validation-severity="blocking"]')).toBeVisible();
    await confirmation.check();
    await expect(page.locator('[data-validation-severity="blocking"]')).toHaveCount(0);
    await expect(page.getByText("Нужно исправить перед публикацией")).toHaveCount(0);

    await confirmation.uncheck();
    await expect(page.locator('[data-validation-severity="blocking"]')).toBeVisible();
    await expect(page.getByText("Нужно исправить перед публикацией")).toBeVisible();
  });

  test("supports keyboard review and a mobile viewport without horizontal overflow", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    const exerciseToggle = page.locator(".exercise-card-toggle").first();
    await exerciseToggle.focus();
    await expect(exerciseToggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(exerciseToggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(exerciseToggle).toHaveAttribute("aria-expanded", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test("shows a recoverable error and succeeds after an explicit reload", async ({ page }) => {
    let failing = true;
    await page.unroute(`**/api/imports/${runId}`);
    await page.route(`**/api/imports/${runId}`, (route) => {
      if (failing) {
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      }
      if (liveReviewEnabled) return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewWorkspaceFixture)
      });
    });
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    await expect(page.getByRole("heading", { name: "Не удалось открыть импорт" })).toBeVisible();
    failing = false;
    await page.reload();
    await expect(page.getByText("Проверка импорта").first()).toBeVisible();
  });
});
