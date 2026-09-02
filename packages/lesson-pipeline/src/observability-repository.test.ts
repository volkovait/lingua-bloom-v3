import { describe, expect, test } from "vitest";

import {
  GenerationManifestSchema,
  RunEventSchema,
  StructuralPipelineManifestSchema,
  createStructuralPipelineManifest
} from "./observability";
import { redactSensitive } from "./observability-repository";

describe("observability redaction", () => {
  test("redacts source text, answers, tokens and signed URLs recursively", () => {
    expect(
      redactSensitive({
        step: "parse",
        sourceText: "private lesson",
        nested: {
          acceptedValues: ["secret"],
          sessionToken: "token",
          signedUrl: "https://private",
          rawText: "source fragment",
          evidence: "copied source",
          apiKey: "credential"
        },
        count: 4,
        tokenUsage: 120
      })
    ).toEqual({
      step: "parse",
      sourceText: "[REDACTED]",
      nested: {
        acceptedValues: "[REDACTED]",
        sessionToken: "[REDACTED]",
        signedUrl: "[REDACTED]",
        rawText: "[REDACTED]",
        evidence: "[REDACTED]",
        apiKey: "[REDACTED]"
      },
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
      parserVersions: { pdf: "1.1.0" },
      model: {
        provider: "openai",
        endpointFamily: "responses",
        model: "gpt-5.4-mini",
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

  test("builds aggregate model/window/reconciliation telemetry without source content", () => {
    const baseCall = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      documentIrId: "ir-1",
      modelId: "model-1",
      promptVersion: "structural-classifier-v2",
      inputVersion: "1.0.0",
      outputVersion: "1.0.0",
      profileVersion: "structure-v2",
      attempt: 1,
      startedAt: "2026-09-02T10:00:00.000Z",
      finishedAt: "2026-09-02T10:00:00.100Z",
      durationMs: 100,
      inputTokens: 10,
      outputTokens: 5,
      aggregateCounts: { blocks: 3, regions: 2 }
    } as const;
    const windows = [
      {
        schemaVersion: "1.0.0",
        runId: "run-1",
        documentIrId: "ir-1",
        windowId: "window-1",
        windowOrdinal: 0,
        profileVersion: "structure-v2",
        promptVersion: "structural-classifier-v2",
        requestSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        modelId: "model-1",
        blockCount: 3,
        overlapBeforeCount: 0,
        overlapAfterCount: 1,
        estimatedInputTokens: 30,
        attempts: 1,
        durationMs: 100,
        outcome: "succeeded",
        modelCallManifestIds: ["call-1"]
      },
      {
        schemaVersion: "1.0.0",
        runId: "run-1",
        documentIrId: "ir-1",
        windowId: "window-2",
        windowOrdinal: 1,
        profileVersion: "structure-v2",
        promptVersion: "structural-classifier-v2",
        requestSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        modelId: "model-1",
        blockCount: 2,
        overlapBeforeCount: 1,
        overlapAfterCount: 0,
        estimatedInputTokens: 20,
        attempts: 1,
        durationMs: 200,
        outcome: "rateLimited",
        modelCallManifestIds: ["call-2"]
      }
    ] as const;
    const reconciliation = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      documentIrId: "ir-1",
      profileVersion: "structure-v2",
      reconciledSchemaVersion: "1.1.0",
      durationMs: 20,
      proposalCount: 1,
      regionCount: 2,
      groupCount: 1,
      exerciseCount: 1,
      sharedResourceCount: 0,
      conflictCounts: { LOW_CONFIDENCE: 1 },
      significantBlockCount: 4,
      accountedBlockCount: 4,
      validationStatus: "needsReview",
      reviewRouted: true
    } as const;

    const structural = createStructuralPipelineManifest({
      runId: "run-1",
      documentIrId: "ir-1",
      profileVersion: "structure-v2",
      promptVersion: "structural-classifier-v2",
      requestSchemaVersion: "1.0.0",
      outputSchemaVersion: "1.0.0",
      reconciledSchemaVersion: "1.1.0",
      modelId: "model-1",
      modelCalls: [
        {
          ...baseCall,
          id: "call-1",
          windowId: "window-1",
          outcome: "succeeded",
          cost: 0.01,
          currency: "USD",
          costUnavailable: false
        },
        {
          ...baseCall,
          id: "call-2",
          windowId: "window-2",
          outcome: "rateLimited",
          inputTokens: null,
          outputTokens: null,
          cost: null,
          currency: null,
          costUnavailable: true
        }
      ],
      windows,
      reconciliation
    });

    expect(structural.aggregate).toEqual({
      windowCount: 2,
      succeededWindowCount: 1,
      failedWindowCount: 1,
      totalAttempts: 2,
      totalDurationMs: 320,
      inputTokens: 10,
      outputTokens: 5,
      callsWithUnavailableUsage: 1,
      reportedCostByCurrency: { USD: 0.01 },
      callsWithUnavailableCost: 1
    });
    expect(StructuralPipelineManifestSchema.safeParse(structural).success).toBe(true);
    expect(
      StructuralPipelineManifestSchema.safeParse({
        ...structural,
        aggregate: { ...structural.aggregate, totalAttempts: 99 }
      }).success
    ).toBe(false);
    expect(
      StructuralPipelineManifestSchema.safeParse({
        ...structural,
        windows: [{ ...structural.windows[0], rawText: "must never be telemetry" }]
      }).success
    ).toBe(false);
    expect(JSON.stringify(structural)).not.toContain("must never be telemetry");
  });
});
