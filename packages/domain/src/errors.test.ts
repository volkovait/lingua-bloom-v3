import { describe, expect, test } from "vitest";

import { retriableFailure, terminalFailure } from "./errors";

describe("failure lifecycle", () => {
  test("allows manual resume only for retriable failures", () => {
    expect(retriableFailure("NETWORK", "Continue manually")).toMatchObject({
      kind: "retriable",
      manualResumeAllowed: true
    });
    expect(terminalFailure("INVALID_SOURCE", "Cannot continue")).toMatchObject({
      kind: "terminal",
      manualResumeAllowed: false
    });
  });

  test("does not expose scheduler or automatic retry metadata", () => {
    expect(retriableFailure("NETWORK", "Continue manually")).not.toHaveProperty("retryAfterMs");
    expect(retriableFailure("NETWORK", "Continue manually")).not.toHaveProperty("nextAttemptAt");
  });
});
