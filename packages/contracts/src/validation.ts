import { z } from "zod";

import { IdSchema, SourceRefSchema } from "./document-ir";

export const SectionSpecSchema = z
  .object({
    id: IdSchema,
    kind: z.enum(["instruction", "example", "exercise", "answerKey", "explanation", "unknown"]),
    blockIds: z.array(IdSchema).min(1),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const ValidationIssueSchema = z
  .object({
    id: IdSchema,
    code: z.enum([
      "SOURCE_TRUNCATED",
      "CANDIDATE_UNMAPPED",
      "UNSUPPORTED_ADDITION",
      "ANSWER_UNVERIFIED",
      "ANSWER_AMBIGUOUS",
      "READING_ORDER_UNCERTAIN",
      "SOURCE_REF_MISSING",
      "OCR_REQUIRED",
      "ANSWER_KEY_CONFLICT",
      "UNSUPPORTED_LAYOUT"
    ]),
    severity: z.enum(["info", "warning", "blocking"]),
    entityIds: z.array(IdSchema),
    evidence: z.array(SourceRefSchema),
    message: z.string().min(1),
    resolution: z.enum(["open", "resolved", "acceptedRisk"])
  })
  .strict();

export const CoverageEntrySchema = z
  .object({
    candidateId: IdSchema,
    outcome: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("exercise"), exerciseIds: z.array(IdSchema).min(1) }).strict(),
      z.object({ kind: z.literal("issue"), issueId: IdSchema }).strict(),
      z.object({ kind: z.literal("decision"), reviewDecisionId: IdSchema }).strict()
    ])
  })
  .strict();

export const CoverageReportSchema = z
  .object({
    entries: z.array(CoverageEntrySchema),
    detectedCandidateCount: z.number().int().nonnegative(),
    accountedCandidateCount: z.number().int().nonnegative(),
    unsupportedAdditionCount: z.number().int().nonnegative(),
    status: z.enum(["passed", "needsReview", "blocked"])
  })
  .strict();

export const ReviewDecisionSchema = z
  .object({
    id: IdSchema,
    actorId: IdSchema,
    createdAt: z.iso.datetime(),
    decision: z.enum(["confirm", "edit", "exclude"]),
    reason: z.string().min(1),
    beforeValue: z.unknown().optional(),
    afterValue: z.unknown().optional(),
    resolvedIssueIds: z.array(IdSchema)
  })
  .strict();

export type CoverageReport = z.infer<typeof CoverageReportSchema>;
export type SectionSpec = z.infer<typeof SectionSpecSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
