import { z } from "zod";

import { IdSchema, SourceRefSchema, type SourceRef } from "./document-ir";

const SourceEvidenceSchema = z.object({ sourceRefs: z.array(SourceRefSchema).min(1) }).strict();
const TeacherEvidenceSchema = z
  .object({
    reviewDecisionIds: z
      .array(IdSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length)
  })
  .strict();

export const ProvenanceLinkSchema = z.union([SourceEvidenceSchema, TeacherEvidenceSchema]);

export const DraftAnswerRecordSchema = z
  .object({
    id: IdSchema,
    acceptedValues: z.array(z.string()),
    provenance: z.enum(["sourceKey", "teacherSupplied", "deterministicRule", "modelInferred"]),
    reviewStatus: z.enum(["verified", "needsReview", "rejected"]),
    evidence: ProvenanceLinkSchema,
    confidence: z.number().min(0).max(1).optional()
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.reviewStatus === "verified" && answer.acceptedValues.length === 0) {
      context.addIssue({ code: "custom", message: "verified answers require accepted values" });
    }
    if (answer.provenance === "sourceKey" && !("sourceRefs" in answer.evidence)) {
      context.addIssue({ code: "custom", message: "sourceKey answers require sourceRefs" });
    }
    if (answer.provenance === "teacherSupplied" && !("reviewDecisionIds" in answer.evidence)) {
      context.addIssue({
        code: "custom",
        message: "teacherSupplied answers require review decisions"
      });
    }
  });

export const AnswerSpecSchema = DraftAnswerRecordSchema.safeExtend({
  acceptedValues: z.array(z.string()).min(1),
  provenance: z.enum(["sourceKey", "teacherSupplied", "deterministicRule"]),
  reviewStatus: z.literal("verified")
});

export const OptionSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    value: z.string(),
    provenance: ProvenanceLinkSchema
  })
  .strict();

export const InteractionKindSchema = z.enum([
  "singleChoice",
  "wordOrder",
  "bracketGap",
  "oddOneOut",
  "wordBankGap"
]);

export const ExerciseSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    interactionKind: InteractionKindSchema,
    prompt: z.string(),
    provenance: ProvenanceLinkSchema,
    options: z.array(OptionSpecSchema),
    answerFields: z.array(AnswerSpecSchema).min(1)
  })
  .strict()
  .superRefine((exercise, context) => {
    const optionMinimum = ["singleChoice", "oddOneOut"].includes(exercise.interactionKind)
      ? 2
      : exercise.interactionKind === "wordBankGap"
        ? 1
        : 0;
    if (exercise.options.length < optionMinimum) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: `requires ${String(optionMinimum)} options`
      });
    }
  });

export const ExerciseGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    instruction: z.string(),
    provenance: ProvenanceLinkSchema,
    exercises: z.array(ExerciseSpecSchema).min(1)
  })
  .strict();

export const PublishedValidationSchema = z
  .object({
    status: z.literal("passed"),
    blockingIssueCount: z.literal(0),
    unsupportedAdditionCount: z.literal(0),
    unresolvedAnswerCount: z.literal(0)
  })
  .strict();

export const LessonSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    lessonId: IdSchema,
    version: z.number().int().positive(),
    title: z.string().min(1),
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    groups: z.array(ExerciseGroupSchema).min(1),
    validation: PublishedValidationSchema
  })
  .strict()
  .superRefine((lesson, context) => {
    for (const ref of collectSourceRefs(lesson)) {
      if (
        ref.sourceDocumentId !== lesson.sourceDocumentId ||
        ref.documentIrId !== lesson.documentIrId
      ) {
        context.addIssue({
          code: "custom",
          message: "SourceRef crosses the LessonSpec source lineage"
        });
        break;
      }
    }
  });

function collectSourceRefs(lesson: z.infer<typeof LessonSpecSchema>): SourceRef[] {
  const refs: SourceRef[] = [];
  const add = (provenance: z.infer<typeof ProvenanceLinkSchema>) => {
    if ("sourceRefs" in provenance) refs.push(...provenance.sourceRefs);
  };
  for (const group of lesson.groups) {
    add(group.provenance);
    for (const exercise of group.exercises) {
      add(exercise.provenance);
      for (const option of exercise.options) add(option.provenance);
      for (const answer of exercise.answerFields) add(answer.evidence);
    }
  }
  return refs;
}

export type DraftAnswerRecord = z.infer<typeof DraftAnswerRecordSchema>;
export type LessonSpec = z.infer<typeof LessonSpecSchema>;
export type OptionSpec = z.infer<typeof OptionSpecSchema>;
