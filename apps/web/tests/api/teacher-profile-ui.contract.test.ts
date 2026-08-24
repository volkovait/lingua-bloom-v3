import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("authenticated teacher profile UI contract", () => {
  test("replaces login with a profile dropdown for an authenticated home page", async () => {
    const source = await readFile(resolve(process.cwd(), "apps/web/app/page.tsx"), "utf8");

    expect(source).toContain("getOptionalTeacher");
    expect(source).toContain("<TeacherProfileMenu profile={profile} />");
    expect(source).toContain("profile ?");
  });

  test("provides identity, navigation and POST sign-out actions", async () => {
    const source = await readFile(
      resolve(process.cwd(), "apps/web/components/auth/teacher-profile-menu.tsx"),
      "utf8"
    );

    expect(source).toContain("teacher-avatar");
    expect(source).toContain("profile.initials");
    expect(source).toContain('href="/lessons"');
    expect(source).toContain('href="/imports/new"');
    expect(source).toContain('action="/auth/signout"');
    expect(source).toContain('method="post"');
  });
});
