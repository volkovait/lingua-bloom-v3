import { expect, test } from "@playwright/test";

test("renders the project baseline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Превращайте материалы в интерактивные уроки"
  );
});
