import fixture from "./fixtures/lesson-spec.v1.json";
import openapiBaseline from "./fixtures/openapi.v0.3.0-baseline.json";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { LessonSpecSchema } from "./lesson-spec";

describe("schema 1.0.0 compatibility", () => {
  test("continues to parse the committed baseline", () => {
    expect(LessonSpecSchema.parse(fixture).schemaVersion).toBe("1.0.0");
  });
});

describe("OpenAPI 0.3.0 compatibility", () => {
  test("does not remove baseline operations or schemas without a version change", async () => {
    const openapi = await readFile(resolve(import.meta.dirname, "../openapi/openapi.yaml"), "utf8");
    expect(openapi).toContain(`version: ${openapiBaseline.version}`);
    for (const operation of openapiBaseline.requiredOperations)
      expect(openapi).toContain(operation);
    for (const schema of openapiBaseline.requiredSchemas) expect(openapi).toContain(schema);
  });

  test("keeps legacy decisions while additively accepting answer and exercise review", async () => {
    const openapi = await readFile(resolve(import.meta.dirname, "../openapi/openapi.yaml"), "utf8");
    expect(openapi).toContain("decisions:");
    expect(openapi).toContain("answerReviews:");
    expect(openapi).toContain("exerciseEdits:");
    expect(openapi).toContain("required: [draftVersion, idempotencyKey]");
  });
});
