import type { DocumentIR, ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
  ANSWER_SUGGESTION_PROMPT_VERSION,
  applyAnswerSuggestions,
  suggestUnverifiedAnswers,
  suggestUnverifiedAnswersWithTelemetry
} from "./openai-answer-suggester";

describe("OpenAI answer suggester", () => {
  test("accepts structured suggestions for known answer fields", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              suggestions: [
                {
                  answerFieldId: "answer-1",
                  acceptedValues: ["goes"],
                  confidence: 0.91,
                  rationale: "Third-person singular"
                }
              ]
            })
          }),
          { status: 200 }
        )
      )
    );
    const suggestions = await suggestUnverifiedAnswers({
      apiKey: "test-key",
      baseUrl: "https://polza.ai/api/v1",
      model: "test-model",
      draft: fixtureDraft(),
      document: fixtureDocument(),
      fetchImpl
    });
    expect(suggestions).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://polza.ai/api/v1/responses", expect.any(Object));
    const enriched = applyAnswerSuggestions(fixtureDraft(), suggestions);
    expect(enriched.groups[0]?.exercises[0]?.answerFields[0]).toMatchObject({
      acceptedValues: ["goes"],
      provenance: "modelInferred",
      reviewStatus: "needsReview",
      confidence: 0.91
    });
  });

  test("rejects hallucinated answer field ids", async () => {
    const fetchImpl = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              suggestions: [
                {
                  answerFieldId: "invented-answer",
                  acceptedValues: ["x"],
                  confidence: 0.5,
                  rationale: "guess"
                }
              ]
            })
          }),
          { status: 200 }
        )
      );
    await expect(
      suggestUnverifiedAnswers({
        apiKey: "test-key",
        baseUrl: "https://polza.ai/api/v1",
        model: "test-model",
        draft: fixtureDraft(),
        document: fixtureDocument(),
        fetchImpl
      })
    ).rejects.toThrow("unknown answer field");
  });

  test("rejects an incomplete answer set", async () => {
    const fetchImpl = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({ suggestions: [] })
          }),
          { status: 200 }
        )
      );
    await expect(
      suggestUnverifiedAnswers({
        apiKey: "test-key",
        baseUrl: "https://polza.ai/api/v1",
        model: "test-model",
        draft: fixtureDraft(),
        document: fixtureDocument(),
        fetchImpl
      })
    ).rejects.toThrow("Model omitted answer fields: answer-1");
  });

  test("records versioned prompt, latency, tokens and reported cost", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              suggestions: [
                {
                  answerFieldId: "answer-1",
                  acceptedValues: ["goes"],
                  confidence: 0.9,
                  rationale: "source-supported"
                }
              ]
            }),
            usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30, cost_usd: 0.002 }
          }),
          { status: 200 }
        )
      )
    );
    const result = await suggestUnverifiedAnswersWithTelemetry({
      apiKey: "test-key",
      baseUrl: "https://polza.ai/api/v1",
      model: "openai/gpt-5.4-mini",
      draft: fixtureDraft(),
      document: fixtureDocument(),
      fetchImpl
    });
    expect(result.telemetry).toMatchObject({
      totalTokens: 30,
      costUsd: 0.002,
      costStatus: "reported"
    });
    const requestBody = fetchImpl.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== "string") throw new Error("Expected a JSON request body");
    const request = JSON.parse(requestBody) as {
      instructions: string;
      input: string;
    };
    expect(request.instructions).toContain(ANSWER_SUGGESTION_PROMPT_VERSION);
    expect(request.instructions).toContain("Solve exercises sharing a groupId jointly");
    expect(request.instructions).toContain("treat options as a shared bank");
    expect(ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION).toBe("answer-suggestion-input/1.1.0");
    expect(JSON.parse(request.input)).toMatchObject({
      exercises: [{ groupId: "group-1", groupOrdinal: 1, answerFieldIds: ["answer-1"] }]
    });
  });

  test("classifies temporary HTTP failures as manually retriable", async () => {
    await expect(
      suggestUnverifiedAnswersWithTelemetry({
        apiKey: "test-key",
        baseUrl: "https://polza.ai/api/v1",
        model: "openai/gpt-5.4-mini",
        draft: fixtureDraft(),
        document: fixtureDocument(),
        fetchImpl: () => Promise.resolve(new Response("busy", { status: 429 }))
      })
    ).rejects.toMatchObject({
      code: "MODEL_HTTP_FAILURE",
      kind: "retriable"
    });
  });
});

function fixtureDraft(): ReviewDraft {
  const ref = { sourceDocumentId: "source-1", documentIrId: "ir-1", blockId: "block-1" };
  return {
    schemaVersion: "1.0.0",
    title: "Lesson",
    sourceDocumentId: "source-1",
    documentIrId: "ir-1",
    groups: [
      {
        id: "group-1",
        ordinal: 1,
        instruction: "Complete",
        provenance: { sourceRefs: [ref] },
        exercises: [
          {
            id: "exercise-1",
            ordinal: 1,
            interactionKind: "bracketGap",
            prompt: "He ___ to school (go)",
            provenance: { sourceRefs: [ref] },
            options: [],
            answerFields: [
              {
                id: "answer-1",
                acceptedValues: [],
                provenance: "deterministicRule",
                reviewStatus: "needsReview",
                evidence: { sourceRefs: [ref] }
              }
            ]
          }
        ]
      }
    ],
    coverage: {
      entries: [],
      detectedCandidateCount: 1,
      accountedCandidateCount: 1,
      unsupportedAdditionCount: 0,
      status: "needsReview"
    }
  };
}

function fixtureDocument(): DocumentIR {
  return {
    schemaVersion: "1.0.0",
    id: "ir-1",
    sourceDocumentId: "source-1",
    pages: [{ index: 0, width: 100, height: 100 }],
    blocks: [
      { id: "block-1", pageIndex: 0, kind: "text", rawText: "He ___ to school (go)", order: 0 }
    ],
    warnings: []
  };
}
