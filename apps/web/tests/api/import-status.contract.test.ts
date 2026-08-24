import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("OpenAPI failure lifecycle", () => {
  test("uses failed/retriable or failed/terminal with manual resume only", async () => {
    const openapi = await readFile(
      resolve(
        import.meta.dirname,
        "../../../../specs/001-reliable-source-ingestion/contracts/openapi.yaml"
      ),
      "utf8"
    );
    expect(openapi).toContain("manualResumeAllowed");
    expect(openapi).toContain("enum: [retriable, terminal]");
    expect(openapi).not.toMatch(/\bretrying\b/);
    expect(openapi).not.toContain("nextAttemptAt");
  });
});
