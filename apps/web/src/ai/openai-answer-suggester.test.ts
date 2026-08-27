import type { DocumentIR, ReviewDraft } from "@lingua-bloom/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
  ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION,
  ANSWER_SUGGESTION_PROMPT_VERSION,
  MAX_ANSWER_FIELDS_PER_SUGGESTION_BATCH,
  applyAnswerSuggestions,
  suggestUnverifiedAnswers,
  suggestUnverifiedAnswersWithTelemetry
} from "./openai-answer-suggester";

describe("OpenAI answer suggester", () => {
  test("accepts structured suggestions for known answer fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
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
      draft: wordBankFixtureDraft(),
      document: fixtureDocument(),
      fetchImpl
    });
    expect(suggestions).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://polza.ai/api/v1/responses", expect.any(Object));
    const firstRequestBody = fetchImpl.mock.calls[0]?.[1]?.body;
    if (typeof firstRequestBody !== "string") throw new Error("Expected request body");
    expect(JSON.parse((JSON.parse(firstRequestBody) as { input: string }).input)).toMatchObject({
      exercises: [{ sharedResources: [{ entries: ["goes"], usagePolicy: "useOnce" }] }]
    });
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
      text: {
        format: {
          schema: {
            properties: {
              suggestions: {
                items: { properties: { acceptedValues: { items: { minLength?: number } } } };
              };
            };
          };
        };
      };
    };
    expect(request.instructions).toContain(ANSWER_SUGGESTION_PROMPT_VERSION);
    expect(request.instructions).toContain("Solve exercises sharing a groupId jointly");
    expect(request.instructions).toContain("use the exact entries in sharedResources as the bank");
    expect(ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION).toBe("answer-suggestion-input/1.2.0");
    expect(ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION).toBe("answer-suggestion-output/1.1.0");
    expect(
      request.text.format.schema.properties.suggestions.items.properties.acceptedValues.items
        .minLength
    ).toBe(1);
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

  test("does not send teacher-only ambiguous fields to the model", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const suggestions = await suggestUnverifiedAnswers({
      apiKey: "test-key",
      baseUrl: "https://polza.ai/api/v1",
      model: "test-model",
      draft: fixtureDraft(),
      document: fixtureDocument(),
      excludedAnswerFieldIds: ["answer-1"],
      fetchImpl
    });
    expect(suggestions).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("batches large drafts without splitting groups and aggregates telemetry", async () => {
    const draft = batchedFixtureDraft();
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      const request = JSON.parse(init.body) as {
        input: string;
      };
      const input = JSON.parse(request.input) as {
        exercises: { groupId: string; answerFieldIds: string[] }[];
      };
      const suggestions = input.exercises.flatMap((exercise) =>
        exercise.answerFieldIds.map((answerFieldId) => ({
          answerFieldId,
          acceptedValues: ["answer"],
          confidence: 0.8,
          rationale: "batch test"
        }))
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({ suggestions }),
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_usd: 0.001 }
          }),
          { status: 200 }
        )
      );
    });

    const result = await suggestUnverifiedAnswersWithTelemetry({
      apiKey: "test-key",
      baseUrl: "https://polza.ai/api/v1",
      model: "test-model",
      draft,
      document: fixtureDocument(),
      fetchImpl
    });

    expect(MAX_ANSWER_FIELDS_PER_SUGGESTION_BATCH).toBe(64);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.suggestions).toHaveLength(130);
    expect(result.telemetry).toMatchObject({
      inputTokens: 30,
      outputTokens: 60,
      totalTokens: 90,
      costUsd: 0.003,
      costStatus: "reported"
    });
    for (const call of fetchImpl.mock.calls) {
      const body = call[1]?.body;
      if (typeof body !== "string") throw new Error("Expected a JSON request body");
      const input = JSON.parse((JSON.parse(body) as { input: string }).input) as {
        exercises: { groupId: string; answerFieldIds: string[] }[];
      };
      expect(new Set(input.exercises.map((exercise) => exercise.groupId))).toHaveLength(1);
      expect(
        input.exercises.flatMap((exercise) => exercise.answerFieldIds).length
      ).toBeLessThanOrEqual(64);
    }
  });
});

function wordBankFixtureDraft(): ReviewDraft {
  const base = fixtureDraft();
  const group = base.groups[0];
  const exercise = group?.exercises[0];
  if (!group || !exercise) throw new Error("Invalid fixture");
  const resourceId = "group-1:shared:word-bank";
  const provenance = exercise.provenance;
  return {
    ...base,
    schemaVersion: "1.1.0",
    groups: [
      {
        ...group,
        sharedResources: [
          {
            id: resourceId,
            ordinal: 1,
            kind: "wordBank",
            entries: [
              {
                id: resourceId + ":entry:1",
                ordinal: 1,
                value: "goes",
                provenance
              }
            ],
            usagePolicy: "useOnce",
            provenance
          }
        ],
        exercises: [
          {
            ...exercise,
            interactionKind: "wordBankGap",
            sharedResourceId: resourceId,
            options: []
          }
        ]
      }
    ]
  };
}

function batchedFixtureDraft(): ReviewDraft {
  const base = fixtureDraft();
  const sourceGroup = base.groups[0];
  const sourceExercise = sourceGroup?.exercises[0];
  const sourceAnswer = sourceExercise?.answerFields[0];
  if (!sourceGroup || !sourceExercise || !sourceAnswer) throw new Error("Invalid fixture");
  return {
    ...base,
    groups: Array.from({ length: 1 }, (_, groupIndex) => ({
      ...sourceGroup,
      id: `group-${String(groupIndex + 1)}`,
      ordinal: groupIndex + 1,
      exercises: [
        {
          ...sourceExercise,
          id: `exercise-${String(groupIndex + 1)}`,
          answerFields: Array.from({ length: 130 }, (_, answerIndex) => ({
            ...sourceAnswer,
            id: `answer-${String(groupIndex + 1)}-${String(answerIndex + 1)}`
          }))
        }
      ]
    }))
  };
}

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
