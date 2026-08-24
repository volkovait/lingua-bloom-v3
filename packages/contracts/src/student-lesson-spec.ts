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
    options: z.array(StudentOptionSchema),
    responseFields: z.array(ResponseFieldSchema).min(1)
  })
  .strict();
const StudentGroupSchema = z
  .object({
    id: IdSchema,
    ordinal: z.number().int().positive(),
    instruction: z.string(),
    exercises: z.array(StudentExerciseSchema).min(1)
  })
  .strict();

export const StudentLessonSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    publicLessonId: PublicLessonIdSchema,
    version: z.number().int().positive(),
    title: z.string().min(1),
    groups: z.array(StudentGroupSchema).min(1)
  })
  .strict();

export type StudentLessonSpec = z.infer<typeof StudentLessonSpecSchema>;
