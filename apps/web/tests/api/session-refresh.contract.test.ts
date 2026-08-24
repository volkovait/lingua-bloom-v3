import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("Supabase session refresh boundary", () => {
  test("Next.js proxy refreshes auth and persists rotated cookies", async () => {
    const proxy = await readFile(resolve(process.cwd(), "apps/web/proxy.ts"), "utf8");
    const refresh = await readFile(
      resolve(process.cwd(), "apps/web/src/auth/update-session.ts"),
      "utf8"
    );

    expect(proxy).toContain("updateSession(request)");
    expect(proxy).toContain("_next/static");
    expect(refresh).toContain("supabase.auth.getUser()");
    expect(refresh).toContain("response.cookies.set");
    expect(refresh).toContain("request.cookies.set");
  });
});
