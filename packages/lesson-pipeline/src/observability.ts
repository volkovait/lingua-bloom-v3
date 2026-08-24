import { z } from "zod";

export const RunStatusSchema = z.enum([
  "accepted",
  "processing",
  "awaiting_review",
  "blocked",
  "ready_to_publish",
  "completed",
  "cancelled",
  "failed"
]);

export const FailureInfoSchema = z
  .object({
    code: z.string().min(1),
    kind: z.enum(["retriable", "terminal"]),
    message: z.string().min(1),
    manualResumeAllowed: z.boolean(),
    limitType: z.enum(["pdfPages", "pdfBytes", "textCharacters", "answerFields"]).optional(),
    limit: z.number().int().positive().optional(),
    actual: z.number().int().positive().optional()
  })
  .strict();

export const RunEventSchema = z
  .object({
    runId: z.string().min(1),
    sequence: z.number().int().positive(),
    type: z.string().min(1),
    status: RunStatusSchema,
    step: z.string().min(1).optional(),
    failure: FailureInfoSchema.optional(),
    occurredAt: z.iso.datetime(),
    attributes: z.record(z.string(), z.unknown())
  })
  .strict()
  .superRefine((event, context) => {
    if (event.status === "failed" && !event.failure) {
      context.addIssue({ code: "custom", message: "failed requires failure info" });
    }
    if (event.status !== "failed" && event.failure) {
      context.addIssue({ code: "custom", message: "only failed events may carry failure info" });
    }
    if (
      event.failure &&
      event.failure.manualResumeAllowed !== (event.failure.kind === "retriable")
    ) {
      context.addIssue({
        code: "custom",
        message: "manualResumeAllowed must match retriable failure kind"
      });
    }
    if (
      event.failure?.code === "SOURCE_TOO_LARGE" &&
      (!event.failure.limitType || event.failure.limit == null || event.failure.actual == null)
    ) {
      context.addIssue({ code: "custom", message: "SOURCE_TOO_LARGE requires limit details" });
    }
  });

export const GenerationManifestSchema = z
  .object({
    runId: z.string().min(1),
    pipelineVersion: z.string().min(1),
    schemaVersions: z.record(z.string(), z.string()),
    parserVersions: z.record(z.string(), z.string()),
    model: z
      .object({
        provider: z.string().min(1),
        endpointFamily: z.string().min(1),
        model: z.string().min(1),
        promptVersion: z.string().min(1),
        inputSchemaVersion: z.string().min(1),
        outputSchemaVersion: z.string().min(1),
        outcome: z.enum(["succeeded", "failed", "skipped"])
      })
      .strict()
      .optional(),
    stepTimingsMs: z.record(z.string(), z.number().nonnegative()),
    tokenUsage: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().nullable().optional(),
    costStatus: z.enum(["reported", "unavailable", "notApplicable"]).optional(),
    warnings: z.array(z.string()),
    validationSummary: z.record(z.string(), z.unknown()),
    finalizedAt: z.iso.datetime()
  })
  .strict();

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type GenerationManifest = z.infer<typeof GenerationManifestSchema>;
