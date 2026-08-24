import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const files = [
  "document-ir.schema.json",
  "lesson-spec.schema.json",
  "student-lesson-spec.schema.json"
];

describe("committed contract mirrors", () => {
  for (const file of files) {
    test(`${file} matches the governing spec`, async () => {
      const packageCopy = await readFile(resolve(import.meta.dirname, "../schemas", file), "utf8");
      const specCopy = await readFile(
        resolve(
          import.meta.dirname,
          "../../../specs/001-reliable-source-ingestion/contracts",
          file
        ),
        "utf8"
      );
      expect(JSON.parse(packageCopy)).toEqual(JSON.parse(specCopy));
    });
  }

  test("OpenAPI 0.3.0 matches the governing spec", async () => {
    const packageCopy = await readFile(
      resolve(import.meta.dirname, "../openapi/openapi.yaml"),
      "utf8"
    );
    const specCopy = await readFile(
      resolve(
        import.meta.dirname,
        "../../../specs/001-reliable-source-ingestion/contracts/openapi.yaml"
      ),
      "utf8"
    );
    expect(packageCopy).toBe(specCopy);
  });
});
