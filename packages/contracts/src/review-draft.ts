import { z } from "zod";

import { IdSchema } from "./document-ir";
import {
  DraftAnswerRecordSchema,
  InteractionKindSchema,
  OptionSpecSchema,
  ProvenanceLinkSchema
} from "./lesson-spec";
import { CoverageReportSchema } from "./validation";

export const ReviewExerciseSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    interactionKind: InteractionKindSchema,
    prompt: z.string(),
    provenance: ProvenanceLinkSchema,
    options: z.array(OptionSpecSchema),
    answerFields: z.array(DraftAnswerRecordSchema).min(1)
  })
  .strict();

export const ReviewGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    instruction: z.string(),
    provenance: ProvenanceLinkSchema,
    exercises: z.array(ReviewExerciseSchema).min(1)
  })
  .strict();

export const ReviewDraftSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    title: z.string().min(1),
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    groups: z.array(ReviewGroupSchema).min(1),
    coverage: CoverageReportSchema
  })
  .strict();

export type ReviewDraft = z.infer<typeof ReviewDraftSchema>;
