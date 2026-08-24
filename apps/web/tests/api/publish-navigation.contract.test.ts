import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("publish navigation contract", () => {
  test("lists ready drafts and links them directly to publication", async () => {
    const source = await readFile(resolve(process.cwd(), "apps/web/app/lessons/page.tsx"), "utf8");

    expect(source).toContain('"ready_to_publish"');
    expect(source).toContain("Черновики и публикация");
    expect(source).toContain("`/imports/${run.id}/publish`");
    expect(source).toContain("Опубликовать урок");
  });

  test("shows a persistent publication gate in the review workspace", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/components/review/review-workspace.tsx"),
      "utf8"
    );

    expect(source).toContain('workspace.status === "ready_to_publish"');
    expect(source).toContain("publication-gate");
    expect(source).toContain("Урок готов к публикации");
    expect(source).toContain('href={"/imports/" + runId + "/publish"}');
    expect(source).toContain("Непроверенных ответов:");
    expect(source).toContain("Открытых блокирующих проблем:");
  });

  test("shows server-provided publication reasons instead of a generic error", async () => {
    const [route, component] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/api/imports/[runId]/publish/route.ts"), "utf8"),
      readFile(
        resolve(process.cwd(), "apps/web/components/lesson/publish-confirmation.tsx"),
        "utf8"
      )
    ]);

    expect(route).toContain("reasons: error.reasons");
    expect(component).toContain("result.reasons");
    expect(component).toContain("Что нужно исправить:");
    expect(component).toContain("formatPublicationReason");
  });
});
