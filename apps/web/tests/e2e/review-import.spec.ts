import { expect, test, type Page } from "@playwright/test";

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

  test("opens an issue and its source evidence in no more than two actions", async ({ page }) => {
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    await expect(page.getByRole("heading", { name: "Проблемы и предупреждения" })).toBeVisible();
    await page.locator(".issue-card").first().click();
    await expect(page.locator(".issue-card.is-selected")).toBeVisible();
    await expect(page.locator(".source-block.is-highlighted").first()).toBeVisible();
  });

  test("supports keyboard review and a mobile viewport without horizontal overflow", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/imports/${encodeURIComponent(runId)}/review`);
    await focusApplicationControl(page);
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

async function focusApplicationControl(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.querySelector("main")?.contains(document.activeElement)))
      return;
  }
  throw new Error("Keyboard navigation did not move focus into the application");
}
