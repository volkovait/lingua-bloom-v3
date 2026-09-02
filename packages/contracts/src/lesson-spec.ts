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
    sourceLabel: z.string().min(1).optional(),
    provenance: ProvenanceLinkSchema
  })
  .strict();

export const WordBankResourceSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    kind: z.literal("wordBank"),
    label: z.string().optional(),
    entries: z.array(OptionSpecSchema).min(1),
    usagePolicy: z.enum(["useOnce", "reusable", "unspecified"]),
    provenance: ProvenanceLinkSchema
  })
  .strict();

export const MatchingBankResourceSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    kind: z.literal("matchingBank"),
    label: z.string().optional(),
    entries: z.array(OptionSpecSchema).min(2),
    usagePolicy: z.literal("useOnce"),
    provenance: ProvenanceLinkSchema
  })
  .strict();

export const SharedExerciseResourceSpecSchema = z.discriminatedUnion("kind", [
  WordBankResourceSpecSchema,
  MatchingBankResourceSpecSchema
]);

export const InteractionKindSchema = z.enum([
  "singleChoice",
  "wordOrder",
  "bracketGap",
  "oddOneOut",
  "wordBankGap",
  "inlineGap",
  "shortText",
  "matching",
  "imageChoice"
]);

export const ReferenceLineSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    rawText: z.string(),
    provenance: ProvenanceLinkSchema
  })
  .strict();

export const ReferenceBlockSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    sourceOrder: z.number().int().nonnegative(),
    lines: z.array(ReferenceLineSpecSchema).min(1)
  })
  .strict();

export const ExerciseSpecSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    interactionKind: InteractionKindSchema,
    prompt: z.string(),
    provenance: ProvenanceLinkSchema,
    sharedResourceId: IdSchema.optional(),
    options: z.array(OptionSpecSchema),
    answerFields: z.array(AnswerSpecSchema).min(1)
  })
  .strict()
  .superRefine((exercise, context) => {
    const optionMinimum = ["singleChoice", "oddOneOut", "imageChoice"].includes(
      exercise.interactionKind
    )
      ? 2
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
    sourceOrder: z.number().int().nonnegative().optional(),
    completeness: z.enum(["complete", "partial"]).optional(),
    missingBoundary: z.enum(["start", "end", "both"]).optional(),
    instruction: z.string(),
    provenance: ProvenanceLinkSchema,
    sharedResources: z.array(SharedExerciseResourceSpecSchema).optional(),
    exercises: z.array(ExerciseSpecSchema).min(1)
  })
  .strict()
  .superRefine((group, context) => {
    if (group.completeness === "partial" && group.missingBoundary == null) {
      context.addIssue({
        code: "custom",
        path: ["missingBoundary"],
        message: "partial groups require a missing boundary"
      });
    }
    if (group.completeness !== "partial" && group.missingBoundary != null) {
      context.addIssue({
        code: "custom",
        path: ["missingBoundary"],
        message: "only partial groups may declare a missing boundary"
      });
    }
  });

export const PublishedValidationSchema = z
  .object({
    status: z.literal("passed"),
    blockingIssueCount: z.literal(0),
    unsupportedAdditionCount: z.literal(0),
    unresolvedAnswerCount: z.literal(0)
  })
  .strict();

const LessonSpecBaseSchema = z
  .object({
    schemaVersion: z.enum(["1.0.0", "1.1.0", "1.2.0"]),
    lessonId: IdSchema,
    version: z.number().int().positive(),
    title: z.string().min(1),
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    groups: z.array(ExerciseGroupSchema).min(1),
    referenceBlocks: z.array(ReferenceBlockSpecSchema).optional(),
    validation: PublishedValidationSchema
  })
  .strict()
  .superRefine((lesson, context) => {
    if (lesson.schemaVersion === "1.1.0" || lesson.schemaVersion === "1.2.0") {
      lesson.groups.forEach((group, index) => {
        if (group.sharedResources == null) {
          context.addIssue({
            code: "custom",
            path: ["groups", index, "sharedResources"],
            message: "v1.1 groups require sharedResources"
          });
        }
        validateSharedResourceGroup(group, index, context, lesson.schemaVersion);
      });
    }
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

function validateSharedResourceGroup(
  group: z.infer<typeof ExerciseGroupSchema>,
  groupIndex: number,
  context: z.RefinementCtx,
  schemaVersion: "1.0.0" | "1.1.0" | "1.2.0"
) {
  const resources = new Map(
    (group.sharedResources ?? []).map((resource) => [resource.id, resource])
  );
  if (resources.size !== (group.sharedResources ?? []).length) {
    context.addIssue({
      code: "custom",
      path: ["groups", groupIndex, "sharedResources"],
      message: "resource IDs must be unique"
    });
  }
  group.exercises.forEach((exercise, exerciseIndex) => {
    const path = ["groups", groupIndex, "exercises", exerciseIndex] as const;
    if (exercise.interactionKind === "wordBankGap") {
      if (exercise.options.length > 0)
        context.addIssue({
          code: "custom",
          path: [...path, "options"],
          message: "wordBankGap local options must be empty"
        });
      if (
        !exercise.sharedResourceId ||
        resources.get(exercise.sharedResourceId)?.kind !== "wordBank"
      )
        context.addIssue({
          code: "custom",
          path: [...path, "sharedResourceId"],
          message: "wordBankGap requires a group wordBank resource"
        });
    } else if (exercise.interactionKind === "matching") {
      if (schemaVersion !== "1.2.0")
        context.addIssue({
          code: "custom",
          path: [...path, "interactionKind"],
          message: "matching requires LessonSpec 1.2.0"
        });
      if (exercise.options.length > 0)
        context.addIssue({
          code: "custom",
          path: [...path, "options"],
          message: "matching local options must be empty"
        });
      if (
        !exercise.sharedResourceId ||
        resources.get(exercise.sharedResourceId)?.kind !== "matchingBank"
      )
        context.addIssue({
          code: "custom",
          path: [...path, "sharedResourceId"],
          message: "matching requires a group matchingBank resource"
        });
      const matchingBank = exercise.sharedResourceId
        ? resources.get(exercise.sharedResourceId)
        : undefined;
      if (matchingBank?.kind === "matchingBank") {
        const entryIds = new Set(matchingBank.entries.map((entry) => entry.id));
        if (
          exercise.answerFields.some(
            (answer) =>
              answer.acceptedValues.length !== 1 || !entryIds.has(answer.acceptedValues[0] ?? "")
          )
        )
          context.addIssue({
            code: "custom",
            path: [...path, "answerFields"],
            message: "matching answers require exactly one stable matching-bank entry ID"
          });
      }
    } else if (exercise.sharedResourceId != null)
      context.addIssue({
        code: "custom",
        path: [...path, "sharedResourceId"],
        message: "only wordBankGap or matching may reference a shared resource"
      });
  });
}

export const LessonSpecSchema = LessonSpecBaseSchema.transform((lesson) =>
  lesson.schemaVersion === "1.0.0" ? normalizeLegacyLesson(lesson) : lesson
);

function normalizeLegacyLesson(lesson: z.infer<typeof LessonSpecBaseSchema>) {
  return {
    ...lesson,
    schemaVersion: "1.1.0" as const,
    groups: lesson.groups.map(normalizeLegacyGroup)
  };
}

export function normalizeLegacyGroup(group: z.infer<typeof ExerciseGroupSchema>) {
  const wordBankExercises = group.exercises.filter(
    (exercise) => exercise.interactionKind === "wordBankGap"
  );
  if (wordBankExercises.length === 0)
    return { ...group, sharedResources: group.sharedResources ?? [] };
  const existing = group.sharedResources?.[0];
  const resourceId = existing?.id ?? `${group.id}:shared:word-bank`;
  const entries = existing?.entries ?? mergeLegacyWordBankEntries(wordBankExercises, resourceId);
  return {
    ...group,
    sharedResources: existing
      ? group.sharedResources
      : [
          {
            id: resourceId,
            ordinal: 1,
            kind: "wordBank" as const,
            label: "",
            entries,
            usagePolicy: "unspecified" as const,
            provenance: group.provenance
          }
        ],
    exercises: group.exercises.map((exercise) =>
      exercise.interactionKind === "wordBankGap"
        ? { ...exercise, sharedResourceId: resourceId, options: [] }
        : exercise
    )
  };
}

export function mergeLegacyWordBankEntries(
  exercises: readonly { readonly options: readonly z.infer<typeof OptionSpecSchema>[] }[],
  resourceId: string
) {
  const entries = new Map<string, z.infer<typeof OptionSpecSchema>>();
  for (const exercise of exercises)
    for (const option of exercise.options)
      if (!entries.has(option.value)) entries.set(option.value, option);
  return [...entries.values()].map((option, entryIndex) => ({
    ...option,
    id: resourceId + ":entry:" + String(entryIndex + 1),
    ordinal: entryIndex + 1
  }));
}

function collectSourceRefs(lesson: z.infer<typeof LessonSpecSchema>): SourceRef[] {
  const refs: SourceRef[] = [];
  const add = (provenance: z.infer<typeof ProvenanceLinkSchema>) => {
    if ("sourceRefs" in provenance) refs.push(...provenance.sourceRefs);
  };
  for (const group of lesson.groups) {
    add(group.provenance);
    for (const resource of group.sharedResources ?? []) {
      add(resource.provenance);
      for (const entry of resource.entries) add(entry.provenance);
    }
    for (const exercise of group.exercises) {
      add(exercise.provenance);
      for (const option of exercise.options) add(option.provenance);
      for (const answer of exercise.answerFields) add(answer.evidence);
    }
  }
  for (const referenceBlock of lesson.referenceBlocks ?? []) {
    for (const line of referenceBlock.lines) add(line.provenance);
  }
  return refs;
}

export type DraftAnswerRecord = z.infer<typeof DraftAnswerRecordSchema>;
export type LessonSpec = z.infer<typeof LessonSpecSchema>;
export type OptionSpec = z.infer<typeof OptionSpecSchema>;
export type SharedExerciseResourceSpec = z.infer<typeof SharedExerciseResourceSpecSchema>;
