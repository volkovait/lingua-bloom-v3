import { describe, expect, test } from "vitest";

import { RunEventSchema } from "./observability";
import { redactSensitive } from "./observability-repository";

describe("observability redaction", () => {
  test("redacts source text, answers, tokens and signed URLs recursively", () => {
    expect(
      redactSensitive({
        step: "parse",
        sourceText: "private lesson",
        nested: { acceptedValues: ["secret"], sessionToken: "token", signedUrl: "https://private" },
        count: 4,
        tokenUsage: 120
      })
    ).toEqual({
      step: "parse",
      sourceText: "[REDACTED]",
      nested: { acceptedValues: "[REDACTED]", sessionToken: "[REDACTED]", signedUrl: "[REDACTED]" },
      count: 4,
      tokenUsage: 120
    });
  });

  test("uses failed for both retriable and terminal failures without automatic retry metadata", () => {
    const base = {
      runId: "run-1",
      sequence: 1,
      type: "step.failed",
      occurredAt: new Date(0).toISOString(),
      attributes: {}
    };
    expect(RunEventSchema.safeParse({ ...base, status: "failed" }).success).toBe(false);
    expect(
      RunEventSchema.safeParse({
        ...base,
        status: "failed",
        failure: {
          code: "TIMEOUT",
          kind: "retriable",
          message: "Continue manually",
          manualResumeAllowed: true
        }
      }).success
    ).toBe(true);
    expect(
      RunEventSchema.safeParse({
        ...base,
        status: "failed",
        failure: {
          code: "INVALID_SOURCE",
          kind: "terminal",
          message: "Cannot continue",
          manualResumeAllowed: false
        }
      }).success
    ).toBe(true);
    expect(
      RunEventSchema.safeParse({
        ...base,
        status: "failed",
        failure: {
          code: "TIMEOUT",
          kind: "retriable",
          message: "Bad contract",
          manualResumeAllowed: false
        }
      }).success
    ).toBe(false);
  });
});
