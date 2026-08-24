import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const projectRoot = resolve(process.cwd(), "../..");

test("an authenticated teacher uploads a PDF and reaches import progress", async ({
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
  const email = `phase3-pdf-${crypto.randomUUID()}@example.com`;
  const password = `Phase3-${crypto.randomUUID()}-aA1!`;
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

    let requestBody = "";
    await page.route("**/api/imports", async (route) => {
      requestBody = route.request().postDataBuffer()?.toString("utf8") ?? "";
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          runId: "run-phase3-e2e",
          sourceDocumentId: "source-phase3-e2e",
          status: "accepted"
        })
      });
    });

    await page.goto("/imports/new");
    await page
      .getByLabel("PDF-файл")
      .setInputFiles(resolve(projectRoot, "tests/fixtures/sources/1_page.pdf"));
    await page.getByRole("button", { name: "Начать импорт" }).click();
    await expect(page.getByLabel("Название урока")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Нужно заполнить")).toBeVisible();

    await page.getByLabel("Название урока").fill("PDF regression test");
    await expect(page.getByLabel("Название урока")).toHaveAttribute("aria-invalid", "false");
    await page.getByRole("button", { name: "Начать импорт" }).click();

    await expect(page).toHaveURL(/\/imports\/run-phase3-e2e$/);
    await expect(page.getByRole("heading", { name: "Импорт принят" })).toBeVisible();
    expect(requestBody).toContain('name="idempotencyKey"');
    expect(requestBody).toContain('name="sourceFile"; filename="1_page.pdf"');
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
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
