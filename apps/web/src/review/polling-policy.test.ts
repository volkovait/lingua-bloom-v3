import { describe, expect, test } from "vitest";

import { shouldPollForDraft } from "./polling-policy";

describe("review polling policy", () => {
  test("polls before a draft exists", () => {
    expect(shouldPollForDraft(null)).toBe(true);
    expect(shouldPollForDraft({ draft: null, status: "processing" })).toBe(true);
  });

  test("stops immediately when a draft appears", () => {
    expect(shouldPollForDraft({ draft: { revision: 1 }, status: "processing" })).toBe(false);
  });

  test("stops when status API offers stale-run recovery", () => {
    expect(
      shouldPollForDraft({
        draft: null,
        status: "accepted",
        recovery: { kind: "dispatch_not_started" }
      })
    ).toBe(false);
  });

  test("does not poll terminal failures that cannot create a draft", () => {
    expect(shouldPollForDraft({ draft: null, status: "failed" })).toBe(false);
  });
});
