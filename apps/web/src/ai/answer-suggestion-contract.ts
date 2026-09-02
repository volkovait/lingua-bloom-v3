import { z } from "zod";

export const AnswerSuggestionPreflightSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    planHash: z.string().length(64),
    answerFieldCount: z.number().int().nonnegative(),
    batchCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    requiresConfirmation: z.boolean(),
    exceedsHardLimit: z.boolean(),
    hardLimitUsd: z.number().positive()
  })
  .strict();

export const AnswerSuggestionPreflightResponseSchema = z
  .object({
    runId: z.string().min(1),
    revision: z.number().int().positive(),
    model: z.string().min(1),
    preflight: AnswerSuggestionPreflightSchema
  })
  .strict();

export const AnswerSuggestionExecutionResultSchema = z
  .object({
    runId: z.string().min(1),
    revision: z.number().int().positive(),
    suggestionCount: z.number().int().nonnegative(),
    preflight: AnswerSuggestionPreflightSchema,
    actualCostUsd: z.number().nonnegative().nullable()
  })
  .strict();

export const AnswerSuggestionErrorResponseSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1).optional(),
    currentRevision: z.number().int().positive().optional(),
    preflight: AnswerSuggestionPreflightSchema.optional()
  })
  .strict();
