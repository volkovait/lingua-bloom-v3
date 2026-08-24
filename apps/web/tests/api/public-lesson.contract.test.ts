import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("public lesson contract", () => {
  test("is anonymous, capability-addressed, non-listable and uniform for misses", async () => {
    const openapi = await readFile(
      resolve(
        import.meta.dirname,
        "../../../../specs/001-reliable-source-ingestion/contracts/openapi.yaml"
      ),
      "utf8"
    );
    expect(openapi).toContain("/api/lessons/{publicLessonId}/student:");
    expect(openapi).toContain("security: []");
    expect(openapi).toContain("Unknown or unpublished public lesson ID");
    expect(openapi).toContain("noindex, nofollow");
    expect(openapi).not.toMatch(/\/api\/lessons:\s*\n\s*get:/);
    expect(openapi).not.toMatch(/\/(revoke|disable|rotate|unpublish)(?:\W|$)/i);
    expect(openapi).not.toMatch(/summary:.*(revoke|disable|rotate|unpublish)/i);
  });
});
