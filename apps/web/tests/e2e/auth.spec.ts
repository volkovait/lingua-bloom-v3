import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const projectRoot = resolve(process.cwd(), "../..");

test.skip(
  process.env.AUTH_E2E_LIVE !== "1",
  "Auth E2E requires an isolated server without fixture-mode auth bypass"
);

test("an unauthenticated teacher is redirected to the login page", async ({ page }) => {
  await page.goto("/imports/new");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fimports%2Fnew$/);
  await expect(page.getByRole("heading", { name: "Войти в аккаунт" })).toBeVisible();
  await expect(page.getByLabel("Электронная почта")).toBeVisible();
  await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible();
});

test("a teacher signs in and returns to the protected import page", async ({ page }) => {
  const environment = parseEnvironment(await readFile(resolve(projectRoot, ".env.local"), "utf8"));
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    test.skip(true, "Supabase E2E credentials are required");
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const suppliedEmail = process.env.AUTH_E2E_EMAIL;
  const suppliedPassword = process.env.AUTH_E2E_PASSWORD;
  const email = suppliedEmail ?? `auth-ui-${crypto.randomUUID()}@example.com`;
  const password = suppliedPassword ?? `AuthUi-${crypto.randomUUID()}-aA1!`;
  let createdUserId: string | undefined;
  if (!suppliedEmail || !suppliedPassword) {
    try {
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (result.error) throw result.error;
      createdUserId = result.data.user.id;
    } catch (error) {
      test.skip(true, `Supabase Admin API is unavailable: ${String(error)}`);
      return;
    }
  }

  try {
    await page.goto("/auth/login?next=%2Fimports%2Fnew");

    await page.getByLabel("Электронная почта").fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();

    await expect(page).toHaveURL(/\/imports\/new$/);
    await expect(page.getByRole("heading", { name: "Перенести готовые упражнения" })).toBeVisible();
  } finally {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
  }
});

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
