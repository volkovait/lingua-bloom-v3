import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("publish navigation contract", () => {
  test("shows published lessons before drafts and provides title/status search", async () => {
    const [page, results] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/lessons/page.tsx"), "utf8"),
      readFile(
        resolve(process.cwd(), "apps/web/components/lesson/lesson-library-results.tsx"),
        "utf8"
      )
    ]);

    expect(results.indexOf('id="published-lessons-title"')).toBeLessThan(
      results.indexOf('id="active-imports-title"')
    );
    expect(page).toContain('name="q"');
    expect(page).toContain('name="status"');
    expect(page).toContain("loadLessonLibraryPage");
    expect(page).toContain("Найдено <strong>{initialPage.totalMatched}</strong>");
    expect(page).not.toContain('className="lesson-total"');
    expect(results).toContain("IntersectionObserver");
    expect(results).toContain("Показать ещё");
  });

  test("returns authenticated teachers from lesson preview to their library", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/app/learn/[publicLessonId]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("getOptionalTeacher");
    expect(source).toContain('href="/lessons"');
    expect(source).toContain("К списку уроков");
  });

  test("lists ready drafts and links them directly to publication", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/components/lesson/lesson-library-results.tsx"),
      "utf8"
    );

    expect(source).toContain('"ready_to_publish"');
    expect(source).toContain("Черновики и публикация");
    expect(source).toContain("`/imports/${run.id}/publish`");
    expect(source).toContain("Опубликовать урок");
  });

  test("keeps the paginated library private and owner-scoped", async () => {
    const [route, repository] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/api/lessons/library/route.ts"), "utf8"),
      readFile(resolve(process.cwd(), "apps/web/src/lessons/library-repository.ts"), "utf8")
    ]);

    expect(route).toContain("requireTeacher");
    expect(route).toContain("AUTH_REQUIRED");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(repository).toContain('.eq("owner_id", ownerId)');
    expect(repository).toContain("planLessonLibraryPage");
  });

  test("shows a persistent publication gate in the review workspace", async () => {
    const [source, editor, styles] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/components/review/review-workspace.tsx"), "utf8"),
      readFile(
        resolve(process.cwd(), "apps/web/components/review/exercise-draft-editor.tsx"),
        "utf8"
      ),
      readFile(resolve(process.cwd(), "apps/web/app/globals.css"), "utf8")
    ]);

    expect(source).toContain('workspace.status === "ready_to_publish"');
    expect(source).toContain("publication-gate");
    expect(source).toContain("Урок готов к публикации");
    expect(source).toContain("href={`/imports/${runId}/publish`}");
    expect(source).not.toContain("Перейти к публикации");
    expect(source.match(/Опубликовать урок/g)).toHaveLength(1);
    expect(source).toContain("Непроверенных ответов:");
    expect(source).toContain("Открытых блокирующих проблем:");
    expect(editor).toContain('className="exercise-interaction-kind"');
    expect(styles).toMatch(/\.exercise-interaction-kind\s*\{\s*margin-top: 8px;/);
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
