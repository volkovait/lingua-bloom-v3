import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { mapNormalizedRangeToRaw, normalizeTextWithSpans } from "./text-normalizer";

describe("text normalizer", () => {
  test("preserves the original and keeps normalized ranges traceable", () => {
    const raw = "She (to\nstudy) every day. mem-\nbers";
    const result = normalizeTextWithSpans(raw);

    expect(result.rawText).toBe(raw);
    expect(result.normalizedText).toBe("She (to study) every day. members");
    const start = result.normalizedText.indexOf("members");
    expect(mapNormalizedRangeToRaw(result, start, start + "members".length)).toEqual({
      rawStart: raw.indexOf("mem-"),
      rawEnd: raw.length
    });
  });

  test("normalization is idempotent for arbitrary whitespace", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("word", " ", "\n", "\r\n", "\t")), (parts) => {
        const once = normalizeTextWithSpans(parts.join("")).normalizedText;
        const twice = normalizeTextWithSpans(once).normalizedText;
        expect(twice).toBe(once);
      })
    );
  });
});
