import { StructuralModelCallManifestSchema } from "@lingua-bloom/contracts";
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

export const StructuralWindowManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    documentIrId: z.string().min(1),
    windowId: z.string().min(1),
    windowOrdinal: z.number().int().nonnegative(),
    profileVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    requestSchemaVersion: z.string().min(1),
    outputSchemaVersion: z.string().min(1),
    modelId: z.string().min(1),
    blockCount: z.number().int().positive(),
    overlapBeforeCount: z.number().int().nonnegative(),
    overlapAfterCount: z.number().int().nonnegative(),
    estimatedInputTokens: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    outcome: z.enum([
      "succeeded",
      "timeout",
      "rateLimited",
      "authFailed",
      "paymentRequired",
      "invalidOutput",
      "providerFailed"
    ]),
    modelCallManifestIds: z.array(z.string().min(1))
  })
  .strict();

export const StructuralReconciliationManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    documentIrId: z.string().min(1),
    profileVersion: z.string().min(1),
    reconciledSchemaVersion: z.string().min(1),
    durationMs: z.number().nonnegative(),
    proposalCount: z.number().int().nonnegative(),
    regionCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    exerciseCount: z.number().int().nonnegative(),
    sharedResourceCount: z.number().int().nonnegative(),
    conflictCounts: z.record(z.string(), z.number().int().nonnegative()),
    significantBlockCount: z.number().int().nonnegative(),
    accountedBlockCount: z.number().int().nonnegative(),
    validationStatus: z.enum(["valid", "needsReview", "blocked"]),
    reviewRouted: z.boolean()
  })
  .strict();

export const StructuralPipelineManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    documentIrId: z.string().min(1),
    profileVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    requestSchemaVersion: z.string().min(1),
    outputSchemaVersion: z.string().min(1),
    reconciledSchemaVersion: z.string().min(1),
    modelId: z.string().min(1),
    modelCalls: z.array(StructuralModelCallManifestSchema).min(1),
    windows: z.array(StructuralWindowManifestSchema).min(1),
    reconciliation: StructuralReconciliationManifestSchema,
    aggregate: z
      .object({
        windowCount: z.number().int().positive(),
        succeededWindowCount: z.number().int().nonnegative(),
        failedWindowCount: z.number().int().nonnegative(),
        totalAttempts: z.number().int().nonnegative(),
        totalDurationMs: z.number().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        callsWithUnavailableUsage: z.number().int().nonnegative(),
        reportedCostByCurrency: z.record(z.string(), z.number().nonnegative()),
        callsWithUnavailableCost: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict()
  .superRefine((manifest, context) => {
    const matchingLineage = manifest.modelCalls.every(
      (call) =>
        call.runId === manifest.runId &&
        call.documentIrId === manifest.documentIrId &&
        call.profileVersion === manifest.profileVersion &&
        call.promptVersion === manifest.promptVersion &&
        call.inputVersion === manifest.requestSchemaVersion &&
        call.outputVersion === manifest.outputSchemaVersion &&
        call.modelId === manifest.modelId
    );
    if (!matchingLineage) {
      context.addIssue({
        code: "custom",
        message: "model call lineage must match manifest versions"
      });
    }
    if (
      manifest.reconciliation.runId !== manifest.runId ||
      manifest.reconciliation.documentIrId !== manifest.documentIrId ||
      manifest.reconciliation.profileVersion !== manifest.profileVersion ||
      manifest.reconciliation.reconciledSchemaVersion !== manifest.reconciledSchemaVersion
    ) {
      context.addIssue({ code: "custom", message: "reconciliation lineage must match manifest" });
    }
    const windowIds = new Set(manifest.windows.map((window) => window.windowId));
    if (windowIds.size !== manifest.windows.length) {
      context.addIssue({ code: "custom", message: "window IDs must be unique" });
    }
    if (
      manifest.windows.some(
        (window) =>
          window.runId !== manifest.runId ||
          window.documentIrId !== manifest.documentIrId ||
          window.profileVersion !== manifest.profileVersion ||
          window.promptVersion !== manifest.promptVersion ||
          window.requestSchemaVersion !== manifest.requestSchemaVersion ||
          window.outputSchemaVersion !== manifest.outputSchemaVersion ||
          window.modelId !== manifest.modelId
      )
    ) {
      context.addIssue({ code: "custom", message: "window lineage must match manifest versions" });
    }
    if (manifest.modelCalls.some((call) => !windowIds.has(call.windowId))) {
      context.addIssue({
        code: "custom",
        message: "every model call must belong to a manifest window"
      });
    }
    const callIds = new Set(manifest.modelCalls.map((call) => call.id));
    const referencedCallIds = manifest.windows.flatMap((window) => window.modelCallManifestIds);
    if (
      referencedCallIds.some((id) => !callIds.has(id)) ||
      new Set(referencedCallIds).size !== referencedCallIds.length ||
      referencedCallIds.length !== callIds.size
    ) {
      context.addIssue({
        code: "custom",
        message: "window model-call references must account for every call exactly once"
      });
    }

    const expectedReportedCost: Record<string, number> = {};
    for (const call of manifest.modelCalls) {
      if (call.cost != null && call.currency != null) {
        expectedReportedCost[call.currency] =
          (expectedReportedCost[call.currency] ?? 0) + call.cost;
      }
    }
    const expectedAggregate = {
      windowCount: manifest.windows.length,
      succeededWindowCount: manifest.windows.filter((window) => window.outcome === "succeeded")
        .length,
      failedWindowCount: manifest.windows.filter((window) => window.outcome !== "succeeded").length,
      totalAttempts: manifest.modelCalls.length,
      totalDurationMs:
        manifest.windows.reduce((sum, window) => sum + window.durationMs, 0) +
        manifest.reconciliation.durationMs,
      inputTokens: manifest.modelCalls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
      outputTokens: manifest.modelCalls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
      callsWithUnavailableUsage: manifest.modelCalls.filter(
        (call) => call.inputTokens == null || call.outputTokens == null
      ).length,
      reportedCostByCurrency: expectedReportedCost,
      callsWithUnavailableCost: manifest.modelCalls.filter((call) => call.costUnavailable).length
    };
    if (JSON.stringify(manifest.aggregate) !== JSON.stringify(expectedAggregate)) {
      context.addIssue({
        code: "custom",
        message: "structural aggregate must be derived from manifests"
      });
    }
  });

export interface CreateStructuralPipelineManifestInput {
  readonly runId: string;
  readonly documentIrId: string;
  readonly profileVersion: string;
  readonly promptVersion: string;
  readonly requestSchemaVersion: string;
  readonly outputSchemaVersion: string;
  readonly reconciledSchemaVersion: string;
  readonly modelId: string;
  readonly modelCalls: readonly unknown[];
  readonly windows: readonly unknown[];
  readonly reconciliation: unknown;
}

export function createStructuralPipelineManifest(
  input: CreateStructuralPipelineManifestInput
): StructuralPipelineManifest {
  const modelCalls = input.modelCalls.map((call) => StructuralModelCallManifestSchema.parse(call));
  const windows = input.windows.map((window) => StructuralWindowManifestSchema.parse(window));
  const reportedCostByCurrency: Record<string, number> = {};
  for (const call of modelCalls) {
    if (call.cost != null && call.currency != null) {
      reportedCostByCurrency[call.currency] =
        (reportedCostByCurrency[call.currency] ?? 0) + call.cost;
    }
  }
  return StructuralPipelineManifestSchema.parse({
    schemaVersion: "1.0.0",
    runId: input.runId,
    documentIrId: input.documentIrId,
    profileVersion: input.profileVersion,
    promptVersion: input.promptVersion,
    requestSchemaVersion: input.requestSchemaVersion,
    outputSchemaVersion: input.outputSchemaVersion,
    reconciledSchemaVersion: input.reconciledSchemaVersion,
    modelId: input.modelId,
    modelCalls,
    windows,
    reconciliation: StructuralReconciliationManifestSchema.parse(input.reconciliation),
    aggregate: {
      windowCount: windows.length,
      succeededWindowCount: windows.filter((window) => window.outcome === "succeeded").length,
      failedWindowCount: windows.filter((window) => window.outcome !== "succeeded").length,
      totalAttempts: modelCalls.length,
      totalDurationMs:
        windows.reduce((sum, window) => sum + window.durationMs, 0) +
        StructuralReconciliationManifestSchema.parse(input.reconciliation).durationMs,
      inputTokens: modelCalls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
      outputTokens: modelCalls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
      callsWithUnavailableUsage: modelCalls.filter(
        (call) => call.inputTokens == null || call.outputTokens == null
      ).length,
      reportedCostByCurrency,
      callsWithUnavailableCost: modelCalls.filter((call) => call.costUnavailable).length
    }
  });
}

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
    structural: StructuralPipelineManifestSchema.optional(),
    finalizedAt: z.iso.datetime()
  })
  .strict();

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type StructuralWindowManifest = z.infer<typeof StructuralWindowManifestSchema>;
export type StructuralReconciliationManifest = z.infer<
  typeof StructuralReconciliationManifestSchema
>;
export type StructuralPipelineManifest = z.infer<typeof StructuralPipelineManifestSchema>;
export type GenerationManifest = z.infer<typeof GenerationManifestSchema>;
