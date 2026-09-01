import { z } from "zod";

import { IdSchema, SourceRefSchema } from "./document-ir";

export const UnknownExerciseCandidateSchema = z
  .object({
    id: IdSchema,
    sourceOrdinal: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
    rawPrompt: z.string().min(1),
    classification: z.literal("unknown"),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().min(1)),
    sourceRefs: z.array(SourceRefSchema).min(1)
  })
  .strict();

export const UnknownCandidateDecisionSchema = z.discriminatedUnion("action", [
  z
    .object({
      id: IdSchema,
      candidateId: IdSchema,
      action: z.literal("classify"),
      interactionKind: z.literal("singleChoice"),
      reason: z.string().min(1),
      actorId: IdSchema,
      createdAt: z.iso.datetime()
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      candidateId: IdSchema,
      action: z.literal("exclude"),
      reason: z.string().min(1),
      actorId: IdSchema,
      createdAt: z.iso.datetime()
    })
    .strict()
]);

export const LayoutReviewSubmissionSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128),
    decisions: z
      .array(
        z.discriminatedUnion("action", [
          z
            .object({
              candidateId: IdSchema,
              action: z.literal("classify"),
              interactionKind: z.literal("singleChoice"),
              reason: z.string().min(1)
            })
            .strict(),
          z
            .object({
              candidateId: IdSchema,
              action: z.literal("exclude"),
              reason: z.string().min(1)
            })
            .strict()
        ])
      )
      .min(1)
  })
  .strict();

export const UnknownLayoutReviewSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: IdSchema,
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    revision: z.number().int().positive(),
    status: z.enum(["active", "resolved"]),
    candidates: z.array(UnknownExerciseCandidateSchema).min(1),
    decisions: z.array(UnknownCandidateDecisionSchema).default([]),
    coverage: z
      .object({
        detectedCandidateCount: z.number().int().positive(),
        accountedCandidateCount: z.number().int().nonnegative(),
        status: z.literal("needsReview")
      })
      .strict(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  })
  .strict();

export type UnknownExerciseCandidate = z.infer<typeof UnknownExerciseCandidateSchema>;
export type UnknownLayoutReview = z.infer<typeof UnknownLayoutReviewSchema>;
export type UnknownCandidateDecision = z.infer<typeof UnknownCandidateDecisionSchema>;
export type LayoutReviewSubmission = z.infer<typeof LayoutReviewSubmissionSchema>;
