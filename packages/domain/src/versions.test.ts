import { describe, expect, test } from "vitest";

import { ARTIFACT_VERSIONS } from "./versions";

describe("artifact versions", () => {
  test("pins the document-wide reading association parser change to PDF parser 1.1.0", () => {
    expect(ARTIFACT_VERSIONS.pdfParser).toBe("1.1.0");
  });
});
