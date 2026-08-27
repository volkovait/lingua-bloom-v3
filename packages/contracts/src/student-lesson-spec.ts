import { z } from "zod";

import { IdSchema } from "./document-ir";
import { InteractionKindSchema } from "./lesson-spec";

export const PublicLessonIdSchema = z
  .string()
  .min(22)
  .regex(/^[A-Za-z0-9_-]+$/);

const StudentOptionSchema = z
  .object({ id: IdSchema, ordinal: z.number().int().positive(), value: z.string() })
  .strict();
const ResponseFieldSchema = z
  .object({ id: IdSchema, responseKind: z.enum(["choice", "text", "orderedTokens"]) })
  .strict();
const StudentExerciseSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    interactionKind: InteractionKindSchema,
    prompt: z.string(),
    sharedResourceId: IdSchema.optional(),
    options: z.array(StudentOptionSchema),
    responseFields: z.array(ResponseFieldSchema).min(1)
  })
  .strict();
const StudentGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    sourceOrder: z.number().int().nonnegative().optional(),
    completeness: z.enum(["complete", "partial"]).optional(),
    missingBoundary: z.enum(["start", "end", "both"]).optional(),
    instruction: z.string(),
    sharedResources: z
      .array(
        z
          .object({
            id: IdSchema,
            ordinal: z.number().int().positive(),
            kind: z.literal("wordBank"),
            label: z.string().optional(),
            entries: z.array(StudentOptionSchema).min(1),
            usagePolicy: z.enum(["useOnce", "reusable", "unspecified"])
          })
          .strict()
      )
      .optional(),
    exercises: z.array(StudentExerciseSchema).min(1)
  })
  .strict()
  .superRefine((group, context) => {
    if (group.completeness === "partial" && group.missingBoundary == null)
      context.addIssue({
        code: "custom",
        path: ["missingBoundary"],
        message: "partial groups require a missing boundary"
      });
    if (group.completeness !== "partial" && group.missingBoundary != null)
      context.addIssue({
        code: "custom",
        path: ["missingBoundary"],
        message: "only partial groups may declare a missing boundary"
      });
  });

export const StudentReferenceBlockSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    sourceOrder: z.number().int().nonnegative(),
    lines: z
      .array(
        z
          .object({ id: IdSchema, ordinal: z.number().int().positive(), rawText: z.string() })
          .strict()
      )
      .min(1)
  })
  .strict();

const StudentLessonSpecBaseSchema = z
  .object({
    schemaVersion: z.enum(["1.0.0", "1.1.0"]),
    publicLessonId: PublicLessonIdSchema,
    version: z.number().int().positive(),
    title: z.string().min(1),
    groups: z.array(StudentGroupSchema).min(1),
    referenceBlocks: z.array(StudentReferenceBlockSchema).optional()
  })
  .strict()
  .superRefine((lesson, context) => {
    if (lesson.schemaVersion === "1.1.0")
      lesson.groups.forEach((group, index) => {
        if (group.sharedResources == null)
          context.addIssue({
            code: "custom",
            path: ["groups", index, "sharedResources"],
            message: "v1.1 groups require sharedResources"
          });
        const resources = new Map(
          (group.sharedResources ?? []).map((resource) => [resource.id, resource])
        );
        group.exercises.forEach((exercise, exerciseIndex) => {
          const path = ["groups", index, "exercises", exerciseIndex] as const;
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
          }
        });
      });
  });

export const StudentLessonSpecSchema = StudentLessonSpecBaseSchema.transform((lesson) =>
  lesson.schemaVersion === "1.0.0"
    ? {
        ...lesson,
        schemaVersion: "1.1.0" as const,
        groups: lesson.groups.map((group) => {
          const wordBankExercises = group.exercises.filter(
            (exercise) => exercise.interactionKind === "wordBankGap"
          );
          if (wordBankExercises.length === 0) return { ...group, sharedResources: [] };
          const resourceId = `${group.id}:shared:word-bank`;
          return {
            ...group,
            sharedResources: [
              {
                id: resourceId,
                ordinal: 1,
                kind: "wordBank" as const,
                label: "",
                entries: mergeLegacyStudentWordBankEntries(wordBankExercises, resourceId),
                usagePolicy: "unspecified" as const
              }
            ],
            exercises: group.exercises.map((exercise) =>
              exercise.interactionKind === "wordBankGap"
                ? { ...exercise, sharedResourceId: resourceId, options: [] }
                : exercise
            )
          };
        })
      }
    : lesson
);

function mergeLegacyStudentWordBankEntries(
  exercises: readonly z.infer<typeof StudentExerciseSchema>[],
  resourceId: string
) {
  const entries = new Map<string, z.infer<typeof StudentOptionSchema>>();
  for (const exercise of exercises)
    for (const option of exercise.options)
      if (!entries.has(option.value)) entries.set(option.value, option);
  return [...entries.values()].map((option, entryIndex) => ({
    ...option,
    id: resourceId + ":entry:" + String(entryIndex + 1),
    ordinal: entryIndex + 1
  }));
}

export type StudentLessonSpec = z.infer<typeof StudentLessonSpecSchema>;
