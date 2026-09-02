import { z } from "zod";

import { IdSchema } from "./document-ir";
import {
  DraftAnswerRecordSchema,
  InteractionKindSchema,
  mergeLegacyWordBankEntries,
  OptionSpecSchema,
  ProvenanceLinkSchema,
  ReferenceBlockSpecSchema,
  SharedExerciseResourceSpecSchema
} from "./lesson-spec";
import { CoverageReportSchema } from "./validation";

export const ReviewExerciseSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    interactionKind: InteractionKindSchema,
    prompt: z.string(),
    provenance: ProvenanceLinkSchema,
    sharedResourceId: IdSchema.optional(),
    options: z.array(OptionSpecSchema),
    answerFields: z.array(DraftAnswerRecordSchema).min(1)
  })
  .strict();

export const ReviewGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    sourceOrder: z.number().int().nonnegative().optional(),
    completeness: z.enum(["complete", "partial"]).optional(),
    missingBoundary: z.enum(["start", "end", "both"]).optional(),
    instruction: z.string(),
    provenance: ProvenanceLinkSchema,
    sharedResources: z.array(SharedExerciseResourceSpecSchema).optional(),
    exercises: z.array(ReviewExerciseSchema).min(1)
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

const ReviewDraftBaseSchema = z
  .object({
    schemaVersion: z.enum(["1.0.0", "1.1.0", "1.2.0"]),
    title: z.string().min(1),
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    groups: z.array(ReviewGroupSchema).min(1),
    referenceBlocks: z.array(ReferenceBlockSpecSchema).optional(),
    coverage: CoverageReportSchema
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.schemaVersion === "1.1.0" || draft.schemaVersion === "1.2.0")
      draft.groups.forEach((group, index) => {
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
          } else if (exercise.interactionKind === "matching") {
            if (draft.schemaVersion !== "1.2.0")
              context.addIssue({
                code: "custom",
                path: [...path, "interactionKind"],
                message: "matching requires ReviewDraft 1.2.0"
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
          } else if (exercise.sharedResourceId != null)
            context.addIssue({
              code: "custom",
              path: [...path, "sharedResourceId"],
              message: "only wordBankGap or matching may reference a shared resource"
            });
        });
      });
  });

export const ReviewDraftSchema = ReviewDraftBaseSchema.transform((draft) =>
  draft.schemaVersion === "1.0.0"
    ? {
        ...draft,
        schemaVersion: "1.1.0" as const,
        groups: draft.groups.map(normalizeLegacyReviewGroup)
      }
    : draft
);

function normalizeLegacyReviewGroup(group: z.infer<typeof ReviewGroupSchema>) {
  const wordBankExercises = group.exercises.filter(
    (exercise) => exercise.interactionKind === "wordBankGap"
  );
  if (wordBankExercises.length === 0)
    return { ...group, sharedResources: group.sharedResources ?? [] };
  const existing = group.sharedResources?.[0];
  const resourceId = existing?.id ?? `${group.id}:shared:word-bank`;
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
            entries: mergeLegacyWordBankEntries(wordBankExercises, resourceId),
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

export type ReviewDraft = z.infer<typeof ReviewDraftSchema>;
