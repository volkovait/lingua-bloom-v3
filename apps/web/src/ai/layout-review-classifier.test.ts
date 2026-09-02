import type { UnknownExerciseCandidate } from "@lingua-bloom/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  createLayoutAiPreflight,
  suggestLayoutClassifications,
  toTeacherAction
} from "./layout-review-classifier";

const candidate: UnknownExerciseCandidate = {
  id: "candidate-1",
  sourceOrdinal: 1,
  rawPrompt: "1. Choose the answer\na) One\nb) Two",
  classification: "unknown",
  confidence: 0.4,
  evidence: ["unclassified"],
  sourceRefs: [
    {
      sourceDocumentId: "source-1",
      documentIrId: "ir-1",
      blockId: "block-1"
    }
  ]
};

describe("layout review AI classification", () => {
  test("calculates a deterministic zero-call RUB preflight bound to content and revision", () => {
    const base = {
      runId: "run-1",
      revision: 1,
      model: "model-1",
      candidates: [candidate],
      estimatedRubPer1kTokens: 20,
      hardLimitRub: 1500
    };
    const first = createLayoutAiPreflight(base);
    const same = createLayoutAiPreflight(base);
    const changed = createLayoutAiPreflight({
      ...base,
      revision: 2,
      candidates: [{ ...candidate, rawPrompt: "Changed source text" }]
    });
    expect(first).toMatchObject({
      requestCount: 1,
      candidateCount: 1,
      requiresConfirmation: true,
      exceedsHardLimit: false
    });
    expect(first.planHash).toBe(same.planHash);
    expect(changed.planHash).not.toBe(first.planHash);
  });

  test("accepts only complete typed suggestions for known candidates", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              suggestions: [
                {
                  candidateId: "candidate-1",
                  classification: "singleChoice",
                  confidence: 0.9,
                  rationale: "Contains labelled options"
                }
              ]
            }),
            usage: { input_tokens: 120, output_tokens: 40, cost: 2.5, currency: "RUB" }
          }),
          { status: 200 }
        )
      )
    );
    const result = await suggestLayoutClassifications({
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      model: "model-1",
      candidates: [candidate],
      fetchImpl
    });
    expect(result).toMatchObject({
      suggestions: [{ candidateId: "candidate-1", classification: "singleChoice" }],
      telemetry: {
        model: "model-1",
        promptVersion: "layout-review-classification/1.0.0",
        pricingVersion: "layout-review-rub-pricing/1.0.0",
        inputTokens: 120,
        outputTokens: 40,
        actualCost: 2.5,
        actualCurrency: "RUB"
      }
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("maps AI suggestions to editable teacher actions without persisting them", () => {
    expect(toTeacherAction("reference")).toEqual({ action: "mark", outcome: "reference" });
    expect(toTeacherAction("inlineGap")).toEqual({
      action: "classify",
      interactionKind: "inlineGap"
    });
    expect(toTeacherAction("shortText")).toEqual({
      action: "classify",
      interactionKind: "shortText"
    });
    expect(toTeacherAction("exclude")).toEqual({ action: "exclude" });
  });
});
