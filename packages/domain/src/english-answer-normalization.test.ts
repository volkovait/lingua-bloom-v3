import { describe, expect, test } from "vitest";

import {
  ENGLISH_ANSWER_NORMALIZATION_POLICY,
  matchesEnglishAnswer,
  normalizeEnglishAnswer
} from "./english-answer-normalization";

describe("English answer normalization", () => {
  test("accepts case, whitespace and optional terminal punctuation variants", () => {
    const accepted = ["Do you wear"];
    expect(matchesEnglishAnswer("do you wear", accepted)).toBe(true);
    expect(matchesEnglishAnswer("DO YOU WEAR?", accepted)).toBe(true);
    expect(matchesEnglishAnswer("  Do   You Wear  ? ", accepted)).toBe(true);
  });

  test("accepts expanded contractions", () => {
    expect(matchesEnglishAnswer("DIDN’T REST?", ["did not rest"])).toBe(true);
  });

  test("does not guess question tense, auxiliary or word order", () => {
    const accepted = ["Do you wear"];
    expect(matchesEnglishAnswer("Did you wear?", accepted)).toBe(false);
    expect(matchesEnglishAnswer("Wear you do?", accepted)).toBe(false);
  });

  test("publishes a versioned normalization policy", () => {
    expect(ENGLISH_ANSWER_NORMALIZATION_POLICY).toMatch(/\/1\.0\.0$/u);
    expect(normalizeEnglishAnswer(" Don’t  go! ")).toBe("do not go");
  });
});
