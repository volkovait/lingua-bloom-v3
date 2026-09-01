import { describe, expect, it } from "vitest";

import { splitInlineChoicePrompt } from "./inline-choice";

describe("splitInlineChoicePrompt", () => {
  it("recognizes exactly one source gap", () => {
    expect(splitInlineChoicePrompt("I spoke to ___ hotel manager.")).toEqual({
      before: "I spoke to ",
      after: " hotel manager."
    });
  });

  it("does not force inline choice for zero or multiple gaps", () => {
    expect(splitInlineChoicePrompt("Choose an answer")).toBeNull();
    expect(splitInlineChoicePrompt("___ and ___")).toBeNull();
  });
});
