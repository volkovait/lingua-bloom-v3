import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("accepts an internal application path", () => {
    expect(safeNextPath("/imports/new?source=pdf")).toBe("/imports/new?source=pdf");
  });

  it.each([null, "", "imports/new", "//evil.example", "https://evil.example"])(
    "rejects unsafe redirect %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/imports/new");
    }
  );
});
