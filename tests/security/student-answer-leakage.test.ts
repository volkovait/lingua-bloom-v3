import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("anonymous student boundary", () => {
  test("reads only the persisted student projection", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/src/lessons/student-lesson.ts"),
      "utf8"
    );
    expect(source).toContain('select("student_spec")');
    expect(source).toContain("StudentLessonSpecSchema.safeParse");
    expect(source).not.toContain("lesson_spec");
    expect(source).not.toContain("acceptedValues");
  });

  test("student renderer accepts only StudentLessonSpec", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/components/lesson/lesson-renderer.tsx"),
      "utf8"
    );
    expect(source).toContain("StudentLessonSpec");
    expect(source).not.toContain("acceptedValues");
    expect(source).not.toContain("provenance");
  });

  test("anonymous API and HTML page never load the teacher lesson payload", async () => {
    const [handler, page] = await Promise.all([
      readFile(
        resolve(process.cwd(), "apps/web/app/api/lessons/[lessonRef]/student/route.ts"),
        "utf8"
      ),
      readFile(resolve(process.cwd(), "apps/web/app/learn/[publicLessonId]/page.tsx"), "utf8")
    ]);
    for (const source of [handler, page]) {
      expect(source).not.toContain("acceptedValues");
      expect(source).not.toContain("lesson_spec");
      expect(source).not.toContain("provenance");
    }
    expect(page).toContain("findPublicStudentLesson");
    expect(page).toContain("LessonRenderer");
  });

  test("student surface is anonymous, noindex and uniform for unknown IDs", async () => {
    const [page, handler] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/learn/[publicLessonId]/page.tsx"), "utf8"),
      readFile(
        resolve(process.cwd(), "apps/web/app/api/lessons/[lessonRef]/student/route.ts"),
        "utf8"
      )
    ]);
    expect(page).toContain("index: false");
    expect(page).toContain("notFound()");
    expect(page).not.toContain("requireTeacher");
    expect(handler).toContain("status: 404");
    expect(handler).not.toContain("requireTeacher");
  });

  test("has a browser regression for API, HTML and serialized browser state", async () => {
    const browserTest = await readFile(
      resolve(process.cwd(), "apps/web/tests/e2e/student-answer-leakage.spec.ts"),
      "utf8"
    );
    expect(browserTest).toContain("page.request.get");
    expect(browserTest).toContain("page.content()");
    expect(browserTest).toContain("history.state");
  });
});
