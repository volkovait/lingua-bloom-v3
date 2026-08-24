import { DocumentIRSchema, ReviewDraftSchema, type ReviewDraft } from "@lingua-bloom/contracts";
import { getPublicationBlockReasons } from "@lingua-bloom/lesson-pipeline";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOwnedResource, ResourceNotOwnedError } from "@/src/auth/require-owned-resource";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { inngest } from "@/src/inngest/client";
import { INGESTION_REVIEW_SUBMITTED } from "@/src/inngest/events";
import { applyTeacherAnswerReview } from "@/src/review/apply-answer-review";
import { isMissingRpcFunction } from "@/src/supabase/rpc-compat";

const SubmissionSchema = z
  .object({
    draftVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128),
    decisions: z
      .array(
        z
          .object({
            issueId: z.uuid(),
            decision: z.enum(["confirm", "edit", "exclude"]),
            reason: z.string().min(1),
            replacementValue: z.string().nullable().optional()
          })
          .strict()
      )
      .default([]),
    answerReviews: z
      .array(
        z
          .object({
            answerFieldId: z.string().min(1),
            issueId: z.uuid().nullable().optional(),
            decision: z.enum(["confirm", "edit"]),
            reason: z.string().min(1),
            replacementValue: z.string().min(1)
          })
          .strict()
      )
      .default([]),
    exerciseEdits: z
      .array(
        z
          .object({
            exerciseId: z.string().min(1),
            prompt: z.string().min(1),
            options: z.array(z.object({ id: z.string().min(1), value: z.string() }).strict())
          })
          .strict()
      )
      .default([])
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decisions.length + input.answerReviews.length + input.exerciseEdits.length === 0) {
      context.addIssue({ code: "custom", message: "At least one review action is required" });
    }
  });
const DraftRowSchema = z.object({
  revision: z.number().int().positive(),
  document_ir_id: z.string().min(1),
  payload: z.unknown()
});
const IssueRowSchema = z.object({
  id: z.string().min(1),
  payload: z.unknown(),
  resolution: z.enum(["open", "resolved", "acceptedRisk"]),
  severity: z.string().min(1)
});
const ReviewRpcRowSchema = z.object({
  new_revision: z.number().int().positive(),
  run_status: z.string().min(1)
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { teacher, supabase } = await requireTeacher();
    await requireOwnedResource(supabase, teacher.id, "pipeline_runs", runId);
    const input = SubmissionSchema.parse(await request.json());
    const [draftResult, issueResult] = await Promise.all([
      supabase
        .from("lesson_drafts")
        .select("id,revision,document_ir_id,payload")
        .eq("run_id", runId)
        .single(),
      supabase
        .from("validation_issues")
        .select("id,payload,resolution,severity")
        .eq("run_id", runId)
    ]);
    if (draftResult.error || issueResult.error) throw new Error("Failed to load review state");
    const draftRow = DraftRowSchema.parse(draftResult.data);
    const currentRevision = draftRow.revision;
    const documentResult = await supabase
      .from("document_irs")
      .select("payload")
      .eq("id", draftRow.document_ir_id)
      .single();
    if (documentResult.error)
      throw new Error("Failed to load DocumentIR for publication readiness");
    const document = DocumentIRSchema.parse(documentResult.data.payload);
    if (currentRevision !== input.draftVersion) {
      return NextResponse.json(
        {
          code: "DRAFT_VERSION_CONFLICT",
          message: "Черновик был изменён в другой вкладке. Перезагрузите страницу.",
          currentDraftVersion: currentRevision
        },
        { status: 409 }
      );
    }

    const issueRows = new Map(
      z
        .array(IssueRowSchema)
        .parse(issueResult.data)
        .map((row) => [row.id, row])
    );
    let nextDraft = ReviewDraftSchema.parse(draftRow.payload);
    const legacyAnswerDecisions = input.decisions.map((decision) => {
      const issue = issueRows.get(decision.issueId);
      if (!issue || issue.resolution !== "open") throw new Error("Issue is not open");
      const entityIds = readEntityIds(issue.payload);
      const decisionId = crypto.randomUUID();
      nextDraft = applyDecision(nextDraft, entityIds, decision, decisionId);
      return {
        id: decisionId,
        issueId: decision.issueId,
        actorId: teacher.id,
        createdAt: new Date().toISOString(),
        decision: decision.decision,
        reason: decision.reason,
        replacementValue: decision.replacementValue ?? null,
        resolvedIssueIds: [decision.issueId]
      };
    });
    const answerReviewDecisions = input.answerReviews.map((review) => {
      const issue = review.issueId ? issueRows.get(review.issueId) : undefined;
      if (review.issueId && (!issue || issue.resolution !== "open")) {
        throw new Error("Issue is not open");
      }
      const decisionId = crypto.randomUUID();
      const result = applyTeacherAnswerReview(nextDraft, review, decisionId);
      nextDraft = result.draft;
      return {
        id: decisionId,
        issueId: review.issueId ?? null,
        actorId: teacher.id,
        createdAt: new Date().toISOString(),
        decision: review.decision,
        reason: review.reason,
        beforeValue: result.beforeValue,
        afterValue: result.afterValue,
        resolvedIssueIds: review.issueId ? [review.issueId] : []
      };
    });
    const editDecisions = input.exerciseEdits.map((edit) => {
      const decisionId = crypto.randomUUID();
      const result = applyExerciseEdit(nextDraft, edit, decisionId);
      nextDraft = result.draft;
      return {
        id: decisionId,
        issueId: null,
        actorId: teacher.id,
        createdAt: new Date().toISOString(),
        decision: "edit" as const,
        reason: "Формулировка задания проверена преподавателем",
        beforeValue: result.beforeValue,
        afterValue: { prompt: edit.prompt, options: edit.options },
        resolvedIssueIds: []
      };
    });
    const decisions = [...legacyAnswerDecisions, ...answerReviewDecisions, ...editDecisions];
    const resolvedIssueIds = new Set(decisions.flatMap((decision) => decision.resolvedIssueIds));
    const publicationReasons = getPublicationBlockReasons({
      draft: nextDraft,
      document,
      openBlockingIssueCount: [...issueRows.values()].filter(
        (issue) =>
          issue.resolution === "open" &&
          issue.severity === "blocking" &&
          !resolvedIssueIds.has(issue.id)
      ).length,
      unsupportedAdditionCount: nextDraft.coverage.unsupportedAdditionCount
    });

    const rpcArgs = {
      p_run_id: runId,
      p_expected_revision: input.draftVersion,
      p_idempotency_key: input.idempotencyKey,
      p_decisions: decisions,
      p_payload: nextDraft,
      p_publication_reasons: publicationReasons
    };
    let rpcResult = (await supabase.rpc("apply_review_submission", rpcArgs)) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (
      isMissingRpcFunction(rpcResult.error, "apply_review_submission") &&
      rpcResult.error?.message.includes("p_publication_reasons")
    ) {
      rpcResult = (await supabase.rpc("apply_review_submission", {
        p_run_id: runId,
        p_expected_revision: input.draftVersion,
        p_idempotency_key: input.idempotencyKey,
        p_decisions: decisions,
        p_payload: nextDraft
      })) as { data: unknown; error: { message: string } | null };
    }
    const { data, error } = rpcResult;
    if (error?.message.includes("DRAFT_VERSION_CONFLICT")) {
      const revision = Number(error.message.match(/DRAFT_VERSION_CONFLICT:(\d+)/)?.[1]);
      return NextResponse.json(
        {
          code: "DRAFT_VERSION_CONFLICT",
          message: "Черновик был изменён в другой вкладке. Перезагрузите страницу.",
          currentDraftVersion: Number.isInteger(revision) ? revision : currentRevision
        },
        { status: 409 }
      );
    }
    if (error) throw new Error(error.message);
    const row = ReviewRpcRowSchema.parse(Array.isArray(data) ? data[0] : data);
    let runStatus = row.run_status;
    if (publicationReasons.length > 0 && runStatus === "ready_to_publish") {
      const statusUpdate = await supabase
        .from("pipeline_runs")
        .update({
          status: "awaiting_review",
          current_step: "wait-for-review",
          updated_at: new Date().toISOString()
        })
        .eq("id", runId)
        .eq("owner_id", teacher.id);
      if (statusUpdate.error) throw new Error(statusUpdate.error.message);
      runStatus = "awaiting_review";
    }
    await inngest.send({
      id: `review:${runId}:${input.idempotencyKey}`,
      name: INGESTION_REVIEW_SUBMITTED,
      data: { ownerId: teacher.id, runId, revision: row.new_revision }
    });
    return NextResponse.json(
      {
        runId,
        revision: row.new_revision,
        status: runStatus,
        publicationReasons
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    if (error instanceof ResourceNotOwnedError)
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ code: "INVALID_REVIEW", issues: error.issues }, { status: 400 });
    return NextResponse.json({ code: "REVIEW_FAILED" }, { status: 500 });
  }
}

function applyExerciseEdit(
  draft: ReviewDraft,
  edit: z.infer<typeof SubmissionSchema>["exerciseEdits"][number],
  decisionId: string
) {
  const target = draft.groups
    .flatMap((group) => group.exercises)
    .find((exercise) => exercise.id === edit.exerciseId);
  if (!target) throw new Error("Exercise does not exist in the current draft");
  const beforeValue = {
    prompt: target.prompt,
    options: target.options.map(({ id, value }) => ({ id, value }))
  };
  const next = {
    ...draft,
    groups: draft.groups.map((group) => ({
      ...group,
      exercises: group.exercises.map((exercise) => {
        if (exercise.id !== edit.exerciseId) return exercise;
        const values = new Map(edit.options.map((option) => [option.id, option.value]));
        return {
          ...exercise,
          prompt: edit.prompt,
          provenance: { reviewDecisionIds: [decisionId] },
          options: exercise.options.map((option) => ({
            ...option,
            value: values.get(option.id) ?? option.value,
            provenance: { reviewDecisionIds: [decisionId] }
          }))
        };
      })
    }))
  };
  return { draft: ReviewDraftSchema.parse(next), beforeValue };
}

function readEntityIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const ids = (payload as { entityIds?: unknown }).entityIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function applyDecision(
  draft: ReviewDraft,
  entityIds: readonly string[],
  decision: z.infer<typeof SubmissionSchema>["decisions"][number],
  decisionId: string
): ReviewDraft {
  const affected = new Set(entityIds);
  const replacement = decision.replacementValue?.trim();
  if (decision.decision !== "exclude" && !replacement) {
    throw new Error("A verified answer requires a replacement value");
  }
  return ReviewDraftSchema.parse({
    ...draft,
    groups: draft.groups.map((group) => ({
      ...group,
      exercises: group.exercises
        .filter(
          (exercise) =>
            decision.decision !== "exclude" ||
            !exercise.answerFields.some((field) => affected.has(field.id))
        )
        .map((exercise) => ({
          ...exercise,
          answerFields: exercise.answerFields.map((field) =>
            affected.has(field.id)
              ? {
                  ...field,
                  acceptedValues: [replacement],
                  provenance: "teacherSupplied" as const,
                  reviewStatus: "verified" as const,
                  evidence: { reviewDecisionIds: [decisionId] }
                }
              : field
          )
        }))
    }))
  });
}
