import { z } from "zod";

import { IdSchema } from "./document-ir";

export const STUDENT_ATTEMPT_SCHEMA_VERSION = "1.0.0" as const;
export const STUDENT_GRADER_VERSION = "1.0.0" as const;

const FieldIdSchema = IdSchema.max(200);

const TextResponseSchema = z
  .object({ fieldId: FieldIdSchema, kind: z.literal("text"), value: z.string().max(2000) })
  .strict();
const ChoiceResponseSchema = z
  .object({ fieldId: FieldIdSchema, kind: z.literal("choice"), optionId: z.string().max(200) })
  .strict();
const OrderedTokensResponseSchema = z
  .object({
    fieldId: FieldIdSchema,
    kind: z.literal("orderedTokens"),
    tokenIds: z.array(IdSchema.max(200)).max(200)
  })
  .strict();

export const StudentAttemptResponseSchema = z.discriminatedUnion("kind", [
  TextResponseSchema,
  ChoiceResponseSchema,
  OrderedTokensResponseSchema
]);

export const StudentAttemptSubmissionSchema = z
  .object({
    schemaVersion: z.literal(STUDENT_ATTEMPT_SCHEMA_VERSION),
    attemptId: z.uuid(),
    lessonVersion: z.number().int().positive(),
    studentDisplayName: z.string().trim().min(1).max(120),
    responses: z.array(StudentAttemptResponseSchema).max(500)
  })
  .strict()
  .superRefine((submission, context) => {
    const ids = submission.responses.map((response) => response.fieldId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: "custom", path: ["responses"], message: "duplicate field IDs" });
  });

export const AttemptFieldResultSchema = z
  .object({
    fieldId: FieldIdSchema,
    exerciseId: IdSchema,
    status: z.enum(["correct", "incorrect"]),
    acceptedDisplayValues: z.array(z.string()).min(1).optional()
  })
  .strict()
  .superRefine((field, context) => {
    if (field.status === "correct" && field.acceptedDisplayValues != null)
      context.addIssue({
        code: "custom",
        path: ["acceptedDisplayValues"],
        message: "correct fields must not reveal accepted values"
      });
  });

export const AttemptExerciseResultSchema = z
  .object({ exerciseId: IdSchema, status: z.enum(["correct", "partial", "incorrect"]) })
  .strict();

export const StudentAttemptResultSchema = z
  .object({
    schemaVersion: z.literal(STUDENT_ATTEMPT_SCHEMA_VERSION),
    attemptId: z.uuid(),
    lessonVersion: z.number().int().positive(),
    graderVersion: z.literal(STUDENT_GRADER_VERSION),
    score: z
      .object({ correct: z.number().int().nonnegative(), total: z.number().int().min(1).max(500) })
      .strict(),
    fields: z.array(AttemptFieldResultSchema).min(1).max(500),
    exercises: z.array(AttemptExerciseResultSchema).min(1),
    delivery: z.object({ status: z.enum(["pending", "skipped"]) }).strict()
  })
  .strict()
  .superRefine((result, context) => {
    if (result.score.correct > result.score.total || result.fields.length !== result.score.total)
      context.addIssue({ code: "custom", path: ["score"], message: "score does not match fields" });
  });

export type StudentAttemptSubmission = z.infer<typeof StudentAttemptSubmissionSchema>;
export type StudentAttemptResponse = z.infer<typeof StudentAttemptResponseSchema>;
export type StudentAttemptResult = z.infer<typeof StudentAttemptResultSchema>;
export type AttemptFieldResult = z.infer<typeof AttemptFieldResultSchema>;
