import { expect, test, type Page } from "@playwright/test";

import {
  FIXTURE_PUBLIC_LESSON_ID,
  FIXTURE_REVIEW_RUN_ID,
  mockReviewWorkspace
} from "./fixtures/review-workspace";

const reviewRunId = process.env.E2E_REVIEW_RUN_ID ?? FIXTURE_REVIEW_RUN_ID;
const publicLessonId = process.env.E2E_PUBLIC_LESSON_ID ?? FIXTURE_PUBLIC_LESSON_ID;

test.describe("WCAG-oriented accessibility matrix", () => {
  test("upload view has named controls, landmarks, focus visibility and responsive reflow", async ({
    page
  }) => {
    await page.goto("/imports/new");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Название урока")).toBeVisible();
    await expect(page.getByLabel("PDF-файл")).toBeVisible();
    await expect(page.getByLabel("Вставленный текст")).toBeVisible();
    await assertAccessibilityBaseline(page);
  });

  test("review view exposes status, PDF preview and editor controls", async ({ page }) => {
    if (!process.env.E2E_REVIEW_RUN_ID) await mockReviewWorkspace(page);
    await page.goto(`/imports/${encodeURIComponent(reviewRunId)}/review`);
    await expect(page.getByText("Проверка импорта").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Предпросмотр PDF" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Извлечённые упражнения" })).toBeVisible();
    await assertAccessibilityBaseline(page);
  });

  test("anonymous student view has a navigable lesson form at desktop and mobile sizes", async ({
    page
  }) => {
    await page.goto(`/learn/${encodeURIComponent(publicLessonId)}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Завершить урок" })).toBeVisible();
    await assertAccessibilityBaseline(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
  });
});

async function assertAccessibilityBaseline(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(
    await page.locator("input, textarea, select").evaluateAll((controls) =>
      controls.every((control) => {
        const element = control as HTMLInputElement;
        return Boolean(
          element.labels?.length ||
          element.getAttribute("aria-label") ||
          element.getAttribute("aria-labelledby")
        );
      })
    )
  ).toBe(true);
  expect(
    await page
      .locator("button, a[href]")
      .evaluateAll((controls) =>
        controls.every((control) =>
          Boolean(
            control.textContent.trim() ||
            control.getAttribute("aria-label") ||
            control.getAttribute("aria-labelledby")
          )
        )
      )
  ).toBe(true);
  await focusApplicationControl(page);
  await assertNoHorizontalOverflow(page);
}

async function focusApplicationControl(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.querySelector("main")?.contains(document.activeElement)))
      return;
  }
  throw new Error("Keyboard navigation did not move focus into the application");
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}
