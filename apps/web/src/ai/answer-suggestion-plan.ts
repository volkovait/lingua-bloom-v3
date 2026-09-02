import { createHash } from "node:crypto";

export const ANSWER_SUGGESTION_FIELDS_PER_BATCH = 64;
export const ANSWER_SUGGESTION_CONFIRMATION_FIELD_THRESHOLD = 64;
export const ANSWER_SUGGESTION_CONFIRMATION_BATCH_THRESHOLD = 2;
export const ANSWER_SUGGESTION_CONFIRMATION_COST_USD = 1;
export const ANSWER_SUGGESTION_HARD_COST_LIMIT_USD = 10;
export const ANSWER_SUGGESTION_ESTIMATED_USD_PER_1K_TOKENS = 0.2;
export const ANSWER_SUGGESTION_PRICING_POLICY_VERSION = "answer-suggestion-pricing/1.0.0";
const ESTIMATED_OUTPUT_TOKENS_PER_FIELD = 96;
const ESTIMATED_FIXED_TOKENS_PER_BATCH = 180;

export interface SuggestionPlanExercise {
  readonly groupId: string;
  readonly answerFieldIds: readonly string[];
}

export interface AnswerSuggestionPlanIdentity {
  readonly draftRevision: number;
  readonly promptVersion: string;
  readonly inputSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly pricingPolicyVersion: string;
}

export interface AnswerSuggestionPreflight {
  readonly schemaVersion: "1.0.0";
  readonly planHash: string;
  readonly answerFieldCount: number;
  readonly batchCount: number;
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: number;
  readonly requiresConfirmation: boolean;
  readonly exceedsHardLimit: boolean;
  readonly hardLimitUsd: number;
}

export function packSuggestionBatches<T extends SuggestionPlanExercise>(
  exercises: readonly T[],
  maxFields = ANSWER_SUGGESTION_FIELDS_PER_BATCH
): readonly (readonly T[])[] {
  const grouped = new Map<string, T[]>();
  for (const exercise of exercises) {
    const current = grouped.get(exercise.groupId) ?? [];
    current.push(exercise);
    grouped.set(exercise.groupId, current);
  }

  const units: T[][] = [];
  for (const group of grouped.values()) {
    if (countFields(group) <= maxFields) {
      units.push(group);
      continue;
    }
    let unit: T[] = [];
    for (const exercise of group) {
      for (let offset = 0; offset < exercise.answerFieldIds.length; offset += maxFields) {
        const piece = {
          ...exercise,
          answerFieldIds: exercise.answerFieldIds.slice(offset, offset + maxFields)
        };
        if (unit.length > 0 && countFields(unit) + piece.answerFieldIds.length > maxFields) {
          units.push(unit);
          unit = [];
        }
        unit.push(piece);
      }
    }
    if (unit.length > 0) units.push(unit);
  }

  const batches: T[][] = [];
  for (const unit of [...units].sort((left, right) => countFields(right) - countFields(left))) {
    const target = batches.find((batch) => countFields(batch) + countFields(unit) <= maxFields);
    if (target) target.push(...unit);
    else batches.push([...unit]);
  }
  return batches;
}

export function createAnswerSuggestionPreflight(
  batches: readonly (readonly SuggestionPlanExercise[])[],
  serializedBatchInputs: readonly string[],
  model: string,
  identity: AnswerSuggestionPlanIdentity,
  estimatedUsdPer1kTokens = ANSWER_SUGGESTION_ESTIMATED_USD_PER_1K_TOKENS,
  hardLimitUsd = ANSWER_SUGGESTION_HARD_COST_LIMIT_USD
): AnswerSuggestionPreflight {
  if (serializedBatchInputs.length !== batches.length) {
    throw new Error("SUGGESTION_PLAN_BATCH_IDENTITY_MISMATCH");
  }
  const answerFieldCount = batches.reduce((total, batch) => total + countFields(batch), 0);
  const estimatedTokens = Math.ceil(
    serializedBatchInputs.reduce((total, value) => total + value.length / 4, 0) +
      answerFieldCount * ESTIMATED_OUTPUT_TOKENS_PER_FIELD +
      batches.length * ESTIMATED_FIXED_TOKENS_PER_BATCH
  );
  const estimatedCostUsd = roundUsd((estimatedTokens / 1000) * estimatedUsdPer1kTokens);
  const planIdentity = {
    schemaVersion: "1.0.0",
    model,
    ...identity,
    estimatedUsdPer1kTokens,
    hardLimitUsd,
    batchPayloadDigests: serializedBatchInputs.map(digest)
  };
  return {
    schemaVersion: "1.0.0",
    planHash: digest(JSON.stringify(planIdentity)),
    answerFieldCount,
    batchCount: batches.length,
    estimatedTokens,
    estimatedCostUsd,
    requiresConfirmation:
      answerFieldCount > ANSWER_SUGGESTION_CONFIRMATION_FIELD_THRESHOLD ||
      batches.length > ANSWER_SUGGESTION_CONFIRMATION_BATCH_THRESHOLD ||
      estimatedCostUsd >= ANSWER_SUGGESTION_CONFIRMATION_COST_USD,
    exceedsHardLimit: estimatedCostUsd > hardLimitUsd,
    hardLimitUsd
  };
}

export function suggestionBatchHash(
  planHash: string,
  batchIndex: number,
  serializedBatchInput: string
): string {
  return digest(
    JSON.stringify({ planHash, batchIndex, payloadDigest: digest(serializedBatchInput) })
  );
}

function countFields(exercises: readonly SuggestionPlanExercise[]): number {
  return exercises.reduce((total, exercise) => total + exercise.answerFieldIds.length, 0);
}

function roundUsd(value: number): number {
  return Math.ceil(value * 10000) / 10000;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
