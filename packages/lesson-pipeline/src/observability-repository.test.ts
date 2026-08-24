import { describe, expect, test } from "vitest";

import { GenerationManifestSchema, RunEventSchema } from "./observability";
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

  test("requires versioned redacted model telemetry in the manifest", () => {
    const manifest = GenerationManifestSchema.parse({
      runId: "run-1",
      pipelineVersion: "1.0.0",
      schemaVersions: { lesson: "1.0.0" },
      parserVersions: { pdf: "1.0.0" },
      model: {
        provider: "polza-ai-openai-compatible",
        endpointFamily: "responses",
        model: "openai/gpt-5.4-mini",
        promptVersion: "answer-suggestions/1.1.0",
        inputSchemaVersion: "answer-suggestion-input/1.1.0",
        outputSchemaVersion: "answer-suggestion-output/1.0.0",
        outcome: "succeeded"
      },
      stepTimingsMs: { suggestUnresolvedAnswers: 125 },
      tokenUsage: 30,
      costUsd: null,
      costStatus: "unavailable",
      warnings: [],
      validationSummary: {},
      finalizedAt: new Date(0).toISOString()
    });
    expect(manifest.model?.promptVersion).toBe("answer-suggestions/1.1.0");
    expect(manifest.costStatus).toBe("unavailable");
  });
});
