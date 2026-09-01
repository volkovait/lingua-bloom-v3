import { DocumentIRSchema, UnknownLayoutReviewSchema } from "@lingua-bloom/contracts";
import {
  buildPdfDocumentIr,
  buildTextDocumentIr,
  SupabaseSourceRepository
} from "@lingua-bloom/document-ingestion";
import { ARTIFACT_VERSIONS } from "@lingua-bloom/domain";
import { extractPdfExercises, extractTextExercises } from "@lingua-bloom/exercise-extraction";
import {
  evaluateAnswerFieldLimit,
  getPublicationBlockReasons
} from "@lingua-bloom/lesson-pipeline";
import { z } from "zod";

import {
  ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
  ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION,
  ANSWER_SUGGESTION_PROMPT_VERSION,
  ModelSuggestionError,
  applyAnswerSuggestions,
  suggestUnverifiedAnswersWithTelemetry
} from "@/src/ai/openai-answer-suggester.server";
import { getServerEnvironment } from "@/src/config/server-env";
import { buildReviewDraft } from "@/src/imports/build-review-draft";
import { selectDocumentIrCheckpoint } from "@/src/imports/select-ir-checkpoint";
import { createAdminSupabaseClient } from "@/src/supabase/admin";

import { inngest } from "./client";
import { INGESTION_IMPORT_REQUESTED, INGESTION_REVIEW_SUBMITTED } from "./events";

const ImportEventDataSchema = z.object({
  ownerId: z.string().min(1),
  runId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  kind: z.enum(["pdf", "text"]),
  requestFingerprint: z.string().min(1)
});

const SourceTitleSchema = z.object({ title: z.string().min(1) });
const EventSequenceSchema = z.object({ sequence: z.number().int().positive() }).nullable();

export const reliableIngestion = inngest.createFunction(
  { id: "reliable-source-ingestion", retries: 0 },
  { event: INGESTION_IMPORT_REQUESTED },
  async ({ event, step }) => {
    const { ownerId, runId, sourceDocumentId, kind } = ImportEventDataSchema.parse(event.data);
    const result = await step.run("build-review-draft", async () => {
      const supabase = createAdminSupabaseClient();
      const existing = await supabase
        .from("lesson_drafts")
        .select("id,revision")
        .eq("owner_id", ownerId)
        .eq("run_id", runId)
        .maybeSingle();
      if (existing.error)
        throw new Error(`Failed to check draft checkpoint: ${existing.error.message}`);
      if (existing.data) return { status: "awaiting_review" as const };
      const existingUnknownReview = await supabase
        .from("unknown_layout_reviews")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("run_id", runId)
        .eq("status", "active")
        .maybeSingle();
      if (existingUnknownReview.error)
        throw new Error(
          `Failed to check unknown-layout checkpoint: ${existingUnknownReview.error.message}`
        );
      if (existingUnknownReview.data) return { status: "awaiting_review" as const };

      await updateRun(supabase, runId, ownerId, {
        status: "processing",
        current_step: "build-document-ir"
      });
      await appendRunEvent(supabase, ownerId, runId, "processing", "build-document-ir");

      try {
        const sources = new SupabaseSourceRepository(supabase);
        const [source, bytes] = await Promise.all([
          supabase
            .from("source_documents")
            .select("title")
            .eq("owner_id", ownerId)
            .eq("id", sourceDocumentId)
            .single(),
          sources.readBytes(ownerId, sourceDocumentId)
        ]);
        if (source.error || !bytes) throw new Error("The source could not be loaded");

        const irCheckpointResult = await supabase
          .from("document_irs")
          .select("id,payload")
          .eq("owner_id", ownerId)
          .eq("source_document_id", sourceDocumentId)
          .order("created_at", { ascending: true });
        if (irCheckpointResult.error) throw new Error(irCheckpointResult.error.message);
        const irCheckpoint = selectDocumentIrCheckpoint(kind, irCheckpointResult.data);
        const documentIrId = irCheckpoint?.id ?? crypto.randomUUID();
        const document = irCheckpoint
          ? DocumentIRSchema.parse(irCheckpoint.payload)
          : kind === "pdf"
            ? await buildPdfDocumentIr(bytes, { id: documentIrId, sourceDocumentId })
            : buildTextDocumentIr(new TextDecoder("utf-8", { fatal: true }).decode(bytes), {
                id: documentIrId,
                sourceDocumentId
              });
        if (!irCheckpoint) {
          const { error: irError } = await supabase.from("document_irs").insert({
            id: documentIrId,
            source_document_id: sourceDocumentId,
            owner_id: ownerId,
            schema_version: document.schemaVersion,
            payload: document
          });
          if (irError) throw new Error(`Failed to persist DocumentIR: ${irError.message}`);
        }

        const extraction =
          kind === "pdf"
            ? extractPdfExercises(document, { documentIrId })
            : extractTextExercises(document, { documentIrId });
        const unknownCandidates =
          "unknownCandidates" in extraction ? extraction.unknownCandidates : undefined;
        if (extraction.groups.length === 0 && unknownCandidates?.length) {
          const now = new Date().toISOString();
          const review = UnknownLayoutReviewSchema.parse({
            schemaVersion: "1.0.0",
            runId,
            sourceDocumentId,
            documentIrId,
            revision: 1,
            status: "active",
            candidates: unknownCandidates,
            coverage: {
              detectedCandidateCount: unknownCandidates.length,
              accountedCandidateCount: 0,
              status: "needsReview"
            },
            createdAt: now,
            updatedAt: now
          });
          const issueId = crypto.randomUUID();
          const issue = {
            id: issueId,
            code: "UNSUPPORTED_LAYOUT" as const,
            severity: "blocking" as const,
            entityIds: unknownCandidates.map((candidate) => candidate.id),
            evidence: unknownCandidates.flatMap((candidate) => candidate.sourceRefs),
            message: "Detected source content uses a layout that requires teacher classification",
            resolution: "open" as const
          };
          const { error: reviewError } = await supabase.from("unknown_layout_reviews").insert({
            run_id: runId,
            source_document_id: sourceDocumentId,
            document_ir_id: documentIrId,
            owner_id: ownerId,
            revision: 1,
            status: "active",
            payload: review
          });
          if (reviewError)
            throw new Error(`Failed to persist unknown-layout review: ${reviewError.message}`);
          const { error: issueError } = await supabase.from("validation_issues").insert({
            id: issueId,
            run_id: runId,
            owner_id: ownerId,
            code: issue.code,
            severity: issue.severity,
            payload: issue,
            resolution: issue.resolution
          });
          if (issueError)
            throw new Error(`Failed to persist unknown-layout issue: ${issueError.message}`);
          await updateRun(supabase, runId, ownerId, {
            status: "awaiting_review",
            current_step: "await-layout-review",
            last_successful_checkpoint: "detect-unknown-layout"
          });
          await appendRunEvent(supabase, ownerId, runId, "awaiting_review", "await-layout-review", {
            candidateCount: unknownCandidates.length
          });
          return { status: "awaiting_review" as const };
        }
        const answerFieldCount = extraction.groups.reduce(
          (total, group) =>
            total +
            group.exercises.reduce(
              (groupTotal, exercise) => groupTotal + exercise.answerFields.length,
              0
            ),
          0
        );
        const answerFieldLimit = evaluateAnswerFieldLimit(answerFieldCount);
        if (!answerFieldLimit.allowed) {
          await failRun(
            supabase,
            ownerId,
            runId,
            answerFieldLimit.failure.code,
            answerFieldLimit.failure.message,
            answerFieldLimit.failure.kind,
            "answer-field-limit-exceeded"
          );
          return { status: "failed" as const };
        }
        const issues = extraction.issues.map((issue) => ({ ...issue, id: crypto.randomUUID() }));
        const baseDraft = buildReviewDraft(
          SourceTitleSchema.parse(source.data).title,
          sourceDocumentId,
          documentIrId,
          extraction,
          issues
        );
        const environment = getServerEnvironment();
        let draft = baseDraft;
        let modelSuggestionCount = 0;
        let modelWarning: string | null = null;
        let modelOutcome: "succeeded" | "failed" | "skipped" = environment.OPENAI_API_KEY
          ? "failed"
          : "skipped";
        let modelLatencyMs: number | undefined;
        let modelTelemetry:
          | {
              latencyMs: number;
              totalTokens: number | null;
              costUsd: number | null;
              costStatus: "reported" | "unavailable";
            }
          | undefined;
        if (environment.OPENAI_API_KEY) {
          await updateRun(supabase, runId, ownerId, {
            current_step: "suggest-unresolved-answers",
            last_successful_checkpoint: "validate-coverage"
          });
          try {
            const result = await suggestUnverifiedAnswersWithTelemetry({
              apiKey: environment.OPENAI_API_KEY,
              baseUrl: environment.OPENAI_BASE_URL,
              model: environment.OPENAI_MODEL,
              draft: baseDraft,
              document,
              excludedAnswerFieldIds: issues
                .filter((issue) => issue.code === "ANSWER_AMBIGUOUS")
                .flatMap((issue) => issue.entityIds)
            });
            draft = applyAnswerSuggestions(baseDraft, result.suggestions);
            modelSuggestionCount = result.suggestions.length;
            modelOutcome = "succeeded";
            modelLatencyMs = result.telemetry.latencyMs;
            modelTelemetry = result.telemetry;
            await appendRunEvent(
              supabase,
              ownerId,
              runId,
              "processing",
              "model-answer-suggestions",
              {
                model: environment.OPENAI_MODEL,
                promptVersion: ANSWER_SUGGESTION_PROMPT_VERSION,
                inputSchemaVersion: ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
                outputSchemaVersion: ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION,
                latencyMs: result.telemetry.latencyMs,
                tokenUsage: result.telemetry.totalTokens,
                costUsd: result.telemetry.costUsd,
                costStatus: result.telemetry.costStatus,
                outcome: "succeeded"
              }
            );
          } catch (error) {
            const failure =
              error instanceof ModelSuggestionError
                ? error
                : new ModelSuggestionError(
                    "MODEL_NETWORK_FAILURE",
                    "retriable",
                    error instanceof Error ? error.message : "Model suggestions failed",
                    0
                  );
            modelOutcome = "failed";
            modelLatencyMs = failure.latencyMs;
            modelWarning = `Answer suggestions were skipped (${failure.code}); teacher review is required`;
            await appendRunEvent(
              supabase,
              ownerId,
              runId,
              "processing",
              "model-answer-suggestions-skipped",
              {
                model: environment.OPENAI_MODEL,
                promptVersion: ANSWER_SUGGESTION_PROMPT_VERSION,
                inputSchemaVersion: ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
                outputSchemaVersion: ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION,
                latencyMs: failure.latencyMs,
                outcome: "failed",
                failureKind: failure.kind,
                failureCode: failure.code
              }
            );
          }
        } else {
          modelWarning = "OPENAI_API_KEY is not configured; answer suggestions were skipped";
        }
        const { error: draftError } = await supabase.from("lesson_drafts").insert({
          run_id: runId,
          source_document_id: sourceDocumentId,
          document_ir_id: documentIrId,
          owner_id: ownerId,
          revision: 1,
          payload: draft
        });
        if (draftError) throw new Error(`Failed to persist review draft: ${draftError.message}`);
        if (issues.length > 0) {
          const { error: issueError } = await supabase.from("validation_issues").insert(
            issues.map((issue) => ({
              id: issue.id,
              run_id: runId,
              owner_id: ownerId,
              code: issue.code,
              severity: issue.severity,
              payload: issue,
              resolution: issue.resolution
            }))
          );
          if (issueError)
            throw new Error(`Failed to persist validation issues: ${issueError.message}`);
        }
        const publicationReasons = getPublicationBlockReasons({
          draft,
          document,
          openBlockingIssueCount: issues.filter(
            (issue) => issue.severity === "blocking" && issue.resolution === "open"
          ).length,
          unsupportedAdditionCount: extraction.coverage.unsupportedAdditionCount
        });
        const publicationReady = publicationReasons.length === 0;
        await updateRun(supabase, runId, ownerId, {
          status: publicationReady ? "ready_to_publish" : "awaiting_review",
          current_step: publicationReady ? "review-complete" : "wait-for-review",
          last_successful_checkpoint: "assemble-draft"
        });
        await appendRunEvent(
          supabase,
          ownerId,
          runId,
          publicationReady ? "ready_to_publish" : "awaiting_review",
          publicationReady ? "review-complete" : "wait-for-review",
          publicationReasons.length > 0 ? { publicationReasons } : {}
        );
        await supabase.from("generation_manifests").insert({
          run_id: runId,
          owner_id: ownerId,
          payload: {
            runId,
            pipelineVersion: "1.0.0",
            schemaVersions: { documentIr: "1.0.0", reviewDraft: "1.0.0" },
            parserVersions: {
              [kind]: kind === "pdf" ? ARTIFACT_VERSIONS.pdfParser : ARTIFACT_VERSIONS.textParser,
              answerSuggestionInput: ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
              answerSuggestionOutput: ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION
            },
            ...(environment.OPENAI_API_KEY
              ? {
                  model: {
                    provider: "openai",
                    endpointFamily: "responses",
                    model: environment.OPENAI_MODEL,
                    promptVersion: ANSWER_SUGGESTION_PROMPT_VERSION,
                    inputSchemaVersion: ANSWER_SUGGESTION_INPUT_SCHEMA_VERSION,
                    outputSchemaVersion: ANSWER_SUGGESTION_OUTPUT_SCHEMA_VERSION,
                    outcome: modelOutcome
                  }
                }
              : {}),
            stepTimingsMs: {
              ...(modelLatencyMs == null ? {} : { suggestUnresolvedAnswers: modelLatencyMs })
            },
            ...(modelTelemetry?.totalTokens == null
              ? {}
              : { tokenUsage: modelTelemetry.totalTokens }),
            ...(modelTelemetry
              ? { costUsd: modelTelemetry.costUsd, costStatus: modelTelemetry.costStatus }
              : { costStatus: environment.OPENAI_API_KEY ? "unavailable" : "notApplicable" }),
            warnings: [...document.warnings, ...(modelWarning ? [modelWarning] : [])],
            validationSummary: {
              issueCount: issues.length,
              unsupportedAdditionCount: extraction.coverage.unsupportedAdditionCount,
              modelSuggestionCount,
              modelSuggestionOutcome: modelOutcome,
              publicationReasons
            },
            finalizedAt: new Date().toISOString()
          }
        });
        return {
          status: publicationReady ? ("ready_to_publish" as const) : ("awaiting_review" as const)
        };
      } catch (error) {
        await failRun(
          supabase,
          ownerId,
          runId,
          "INGESTION_FAILED",
          error instanceof Error ? error.message : "Source ingestion failed"
        );
        return { status: "failed" as const };
      }
    });

    if (result.status !== "awaiting_review") return result;
    await step.waitForEvent("wait-for-teacher-review", {
      event: INGESTION_REVIEW_SUBMITTED,
      match: "data.runId",
      timeout: "365d"
    });
    return { status: "review-submitted" };
  }
);

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

async function updateRun(
  supabase: SupabaseAdmin,
  runId: string,
  ownerId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabase
    .from("pipeline_runs")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update run: ${error.message}`);
}

async function appendRunEvent(
  supabase: SupabaseAdmin,
  ownerId: string,
  runId: string,
  status: string,
  stepName: string,
  attributes: Record<string, unknown> = {},
  failure?: {
    code: string;
    kind: "retriable" | "terminal";
    message: string;
    manualResumeAllowed: boolean;
  }
) {
  const latest = await supabase
    .from("run_events")
    .select("sequence")
    .eq("run_id", runId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestEvent = EventSequenceSchema.parse(latest.data);
  const sequence = (latestEvent?.sequence ?? 0) + 1;
  const occurredAt = new Date().toISOString();
  const { error } = await supabase.from("run_events").insert({
    run_id: runId,
    owner_id: ownerId,
    sequence,
    event_type: stepName,
    payload: {
      runId,
      sequence,
      type: stepName,
      status,
      step: stepName,
      occurredAt,
      attributes,
      ...(failure ? { failure } : {})
    }
  });
  if (error && error.code !== "23505")
    throw new Error(`Failed to append run event: ${error.message}`);
}

async function failRun(
  supabase: SupabaseAdmin,
  ownerId: string,
  runId: string,
  code: string,
  message: string,
  kind: "retriable" | "terminal" = "terminal",
  stepName = "ingestion-failed"
) {
  await updateRun(supabase, runId, ownerId, {
    status: "failed",
    failure_kind: kind,
    failure_code: code,
    failure_message: message,
    manual_resume_allowed: kind === "retriable"
  });
  await appendRunEvent(
    supabase,
    ownerId,
    runId,
    "failed",
    stepName,
    {},
    {
      code,
      kind,
      message,
      manualResumeAllowed: kind === "retriable"
    }
  );
}
