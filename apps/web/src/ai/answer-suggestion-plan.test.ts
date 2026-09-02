import { describe, expect, test } from "vitest";

import {
  ANSWER_SUGGESTION_PRICING_POLICY_VERSION,
  createAnswerSuggestionPreflight,
  packSuggestionBatches,
  suggestionBatchHash,
  type AnswerSuggestionPlanIdentity
} from "./answer-suggestion-plan";

const identity: AnswerSuggestionPlanIdentity = {
  draftRevision: 1,
  promptVersion: "prompt/1",
  inputSchemaVersion: "input/1",
  outputSchemaVersion: "output/1",
  pricingPolicyVersion: ANSWER_SUGGESTION_PRICING_POLICY_VERSION
};

describe("answer suggestion cost safety", () => {
  test("densely packs whole groups without exceeding 64 fields", () => {
    const groups = [58, 39, 36, 34, 34, 34, 33, 33, 30, 24, 14].map((count, index) => ({
      groupId: `group:${String(index + 1)}`,
      answerFieldIds: Array.from(
        { length: count },
        (_, field) => `g${String(index)}:f${String(field)}`
      )
    }));
    const batches = packSuggestionBatches(groups);
    expect(batches).toHaveLength(8);
    expect(batches.flatMap((batch) => batch)).toHaveLength(groups.length);
    expect(
      batches.every(
        (batch) =>
          batch.reduce((total, exercise) => total + exercise.answerFieldIds.length, 0) <= 64
      )
    ).toBe(true);
    for (const group of groups) {
      expect(
        batches.filter((batch) => batch.some((item) => item.groupId === group.groupId))
      ).toHaveLength(1);
    }
  });

  test("requires confirmation and blocks plans above the hard cost limit", () => {
    const batches = packSuggestionBatches([
      {
        groupId: "group:1",
        answerFieldIds: Array.from({ length: 369 }, (_, index) => `answer:${String(index)}`)
      }
    ]);
    const serialized = batches.map((batch) => JSON.stringify({ exercises: batch }));
    const preflight = createAnswerSuggestionPreflight(
      batches,
      serialized,
      "openai/gpt-5-mini",
      identity,
      0.2,
      5
    );
    expect(preflight).toMatchObject({
      answerFieldCount: 369,
      requiresConfirmation: true,
      exceedsHardLimit: true,
      hardLimitUsd: 5
    });
  });

  test("binds plan and batch hashes to exact content, revision, versions and pricing", () => {
    const batches = [[{ groupId: "group:1", answerFieldIds: ["answer:1", "answer:2"] }]];
    const payload = JSON.stringify({ exercises: batches[0], prompt: "First wording" });
    const first = createAnswerSuggestionPreflight(batches, [payload], "model", identity);
    const same = createAnswerSuggestionPreflight(batches, [payload], "model", identity);
    const changedPayload = createAnswerSuggestionPreflight(
      batches,
      [JSON.stringify({ exercises: batches[0], prompt: "Changed wording" })],
      "model",
      identity
    );
    const changedRevision = createAnswerSuggestionPreflight(batches, [payload], "model", {
      ...identity,
      draftRevision: 2
    });
    const changedPromptVersion = createAnswerSuggestionPreflight(batches, [payload], "model", {
      ...identity,
      promptVersion: "prompt/2"
    });
    const changedPricing = createAnswerSuggestionPreflight(
      batches,
      [payload],
      "model",
      identity,
      0.3
    );

    expect(first.planHash).toBe(same.planHash);
    expect(
      new Set([
        first.planHash,
        changedPayload.planHash,
        changedRevision.planHash,
        changedPromptVersion.planHash,
        changedPricing.planHash
      ])
    ).toHaveLength(5);
    expect(suggestionBatchHash(first.planHash, 0, payload)).toBe(
      suggestionBatchHash(first.planHash, 0, payload)
    );
    expect(suggestionBatchHash(first.planHash, 0, payload)).not.toBe(
      suggestionBatchHash(first.planHash, 0, payload + "changed")
    );
  });

  test("rejects a preflight whose payload count does not match its physical batches", () => {
    expect(() =>
      createAnswerSuggestionPreflight(
        [[{ groupId: "group:1", answerFieldIds: ["answer:1"] }]],
        [],
        "model",
        identity
      )
    ).toThrow("SUGGESTION_PLAN_BATCH_IDENTITY_MISMATCH");
  });
});
