import { expect, test } from "@playwright/test";

import { FIXTURE_PUBLIC_LESSON_ID } from "./fixtures/review-workspace";

const publicLessonId = process.env.E2E_PUBLIC_LESSON_ID ?? FIXTURE_PUBLIC_LESSON_ID;

test("anonymous student API, HTML and browser state contain no teacher answer payload", async ({
  page
}) => {
  const response = await page.request.get(
    `/api/lessons/${encodeURIComponent(publicLessonId)}/student`
  );
  expect(response.ok()).toBe(true);
  const apiText = await response.text();
  for (const secret of ["acceptedValues", "teacherSupplied", "modelInferred", "provenance"]) {
    expect(apiText).not.toContain(secret);
  }

  await page.goto(`/learn/${encodeURIComponent(publicLessonId)}`);
  await expect(page.getByRole("heading", { name: "English practice · version 2" })).toBeVisible();
  const html = await page.content();
  const visibleText = await page.locator("body").innerText();
  const browserState = await page.evaluate(() => JSON.stringify(history.state));
  for (const surface of [html, visibleText, browserState]) {
    expect(surface).not.toContain("acceptedValues");
    expect(surface).not.toContain("teacherSupplied");
    expect(surface).not.toContain("modelInferred");
  }
});
