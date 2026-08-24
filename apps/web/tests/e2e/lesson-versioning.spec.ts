import { expect, test } from "@playwright/test";

import {
  FIXTURE_LESSON_ID,
  FIXTURE_PUBLIC_LESSON_ID,
  FIXTURE_PUBLISH_RUN_ID
} from "./fixtures/review-workspace";

const lessonId = process.env.E2E_LESSON_ID ?? FIXTURE_LESSON_ID;
const publicLessonId = process.env.E2E_PUBLIC_LESSON_ID ?? FIXTURE_PUBLIC_LESSON_ID;
const secondPublishRunId = process.env.E2E_SECOND_PUBLISH_RUN_ID ?? FIXTURE_PUBLISH_RUN_ID;
const liveMode = Boolean(
  process.env.E2E_LESSON_ID &&
  process.env.E2E_PUBLIC_LESSON_ID &&
  process.env.E2E_SECOND_PUBLISH_RUN_ID
);

test.describe("immutable lesson versions and stable public capability", () => {
  test("publishes v2 only after confirmation and keeps the public ID", async ({ page }) => {
    await page.goto(`/learn/${encodeURIComponent(publicLessonId)}`);
    await expect(page.getByRole("heading", { name: "English practice · version 2" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("acceptedValues");
    await expect(page.locator("body")).not.toContainText("teacherSupplied");

    if (!liveMode) {
      await page.route(`**/api/imports/${secondPublishRunId}/publish`, (route) =>
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ lessonId, publicLessonId, version: 2 })
        })
      );
    }
    await page.goto(`/imports/${encodeURIComponent(secondPublishRunId)}/publish`);
    const publish = page.getByRole("button", { name: "Опубликовать версию" });
    await expect(publish).toBeDisabled();
    await page.getByRole("checkbox").check();
    await publish.click();
    await expect(page.getByRole("heading", { name: "Урок опубликован" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть урок" })).toHaveAttribute(
      "href",
      `/learn/${publicLessonId}`
    );

    await page.goto(`/lessons/${encodeURIComponent(lessonId)}/versions`);
    await expect(page.getByText("Версия 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Версия 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/revoke|disable|rotate|отозвать|отключить/i)).toHaveCount(0);
  });
});
