import { z } from "zod";

export const ATTEMPT_HISTORY_SCHEMA_VERSION = "1.0.0" as const;
export const AttemptHistoryResultStatusSchema = z.enum(["correct", "partial", "incorrect"]);
export const TelegramDeliveryStatusSchema = z.enum([
  "pending",
  "sending",
  "sent",
  "skipped",
  "failed"
]);
export const TelegramFailureCategorySchema = z.enum([
  "unauthorized",
  "rate_limited",
  "provider",
  "ambiguous",
  "internal"
]);
export const AttemptHistoryDeliverySchema = z
  .object({
    status: TelegramDeliveryStatusSchema,
    failureCategory: TelegramFailureCategorySchema.nullable()
  })
  .strict();
export const TeacherAttemptSummarySchema = z
  .object({
    attemptId: z.uuid(),
    lessonId: z.uuid(),
    lessonTitle: z.string().min(1),
    lessonVersion: z.number().int().positive(),
    studentDisplayName: z.string().min(1).max(120),
    createdAt: z.iso.datetime({ offset: true }),
    correctCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive().max(500),
    resultStatus: AttemptHistoryResultStatusSchema,
    delivery: AttemptHistoryDeliverySchema
  })
  .strict();
export const TeacherAttemptHistoryPageSchema = z
  .object({
    schemaVersion: z.literal(ATTEMPT_HISTORY_SCHEMA_VERSION),
    items: z.array(TeacherAttemptSummarySchema).max(100),
    totalMatched: z.number().int().nonnegative(),
    nextCursor: z.string().min(1).nullable()
  })
  .strict();
export const TeacherAttemptFieldSchema = z
  .object({
    ordinal: z.number().int().positive(),
    groupOrdinal: z.number().int().positive(),
    groupInstruction: z.string(),
    exerciseOrdinal: z.number().int().positive(),
    exercisePrompt: z.string(),
    exerciseId: z.string().min(1),
    fieldId: z.string().min(1),
    submittedValue: z.union([z.string(), z.array(z.string())]),
    status: z.enum(["correct", "incorrect"]),
    acceptedDisplayValues: z.array(z.string())
  })
  .strict();
export const TeacherAttemptDetailSchema = z
  .object({
    schemaVersion: z.literal(ATTEMPT_HISTORY_SCHEMA_VERSION),
    summary: TeacherAttemptSummarySchema,
    fields: z.array(TeacherAttemptFieldSchema).min(1).max(500)
  })
  .strict();
export type AttemptHistoryResultStatus = z.infer<typeof AttemptHistoryResultStatusSchema>;
export type TelegramDeliveryStatus = z.infer<typeof TelegramDeliveryStatusSchema>;
export type TeacherAttemptSummary = z.infer<typeof TeacherAttemptSummarySchema>;
export type TeacherAttemptHistoryPage = z.infer<typeof TeacherAttemptHistoryPageSchema>;
export type TeacherAttemptDetail = z.infer<typeof TeacherAttemptDetailSchema>;
