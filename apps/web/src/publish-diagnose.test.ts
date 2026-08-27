import { createClient } from "@supabase/supabase-js";
import { DocumentIRSchema, ReviewDraftSchema } from "@lingua-bloom/contracts";
import { createPublishedLessonSpec, PublicationBlockedError } from "@lingua-bloom/lesson-pipeline";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const RunSchema = z.object({ status: z.string() });
const DraftSchema = z.object({ document_ir_id: z.string(), payload: z.unknown() });
const IssueSchema = z.object({ code: z.string(), severity: z.string(), resolution: z.string() });
const DocumentSchema = z.object({ payload: z.unknown() });
const SupabaseResultSchema = z.object({ data: z.unknown() });

describe("live publish diagnosis", () => {
  test.skipIf(
    process.env.RUN_LIVE_SUPABASE !== "1" ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
  )("prints publication reasons for the isolated UI run", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Live Supabase credentials are required");
    const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const runId = process.env.RUN_ID;
    if (!runId) throw new Error("RUN_ID is required for live publish diagnosis");
    const [runResult, draftResult, issuesResult] = await Promise.all([
      supabase.from("pipeline_runs").select("*").eq("id", runId).single(),
      supabase.from("lesson_drafts").select("*").eq("run_id", runId).single(),
      supabase.from("validation_issues").select("*").eq("run_id", runId)
    ]);
    const parsedRun = RunSchema.parse(SupabaseResultSchema.parse(runResult).data);
    const parsedDraft = DraftSchema.parse(SupabaseResultSchema.parse(draftResult).data);
    const parsedIssues = z.array(IssueSchema).parse(SupabaseResultSchema.parse(issuesResult).data);
    const documentResult = await supabase
      .from("document_irs")
      .select("payload")
      .eq("id", parsedDraft.document_ir_id)
      .single();
    const parsedDocument = DocumentSchema.parse(SupabaseResultSchema.parse(documentResult).data);
    const draft = ReviewDraftSchema.parse(parsedDraft.payload);
    const summary = {
      groupCount: draft.groups.length,
      completeGroupCount: draft.groups.filter((group) => group.completeness === "complete").length,
      partialGroupCount: draft.groups.filter((group) => group.completeness === "partial").length,
      exerciseCount: draft.groups.flatMap((group) => group.exercises).length,
      answerFieldCount: draft.groups.flatMap((group) =>
        group.exercises.flatMap((exercise) => exercise.answerFields)
      ).length,
      unverifiedAnswerFieldCount: draft.groups
        .flatMap((group) => group.exercises.flatMap((exercise) => exercise.answerFields))
        .filter((answer) => answer.reviewStatus !== "verified").length,
      referenceBlockCount: draft.referenceBlocks?.length ?? 0,
      openBlockingIssueCodes: parsedIssues
        .filter((issue) => issue.severity === "blocking" && issue.resolution === "open")
        .map((issue) => issue.code)
    };
    try {
      createPublishedLessonSpec({
        lessonId: crypto.randomUUID(),
        version: 1,
        draft,
        document: DocumentIRSchema.parse(parsedDocument.payload),
        openBlockingIssueCount: parsedIssues.filter(
          (issue) => issue.severity === "blocking" && issue.resolution === "open"
        ).length,
        unsupportedAdditionCount: draft.coverage.unsupportedAdditionCount
      });
      console.log(JSON.stringify({ runStatus: parsedRun.status, reasons: [], summary }));
    } catch (error) {
      if (error instanceof PublicationBlockedError) {
        console.log(
          JSON.stringify({ runStatus: parsedRun.status, reasons: error.reasons, summary })
        );
        expect(parsedRun.status).toBe("awaiting_review");
        return;
      }
      throw error;
    }
    expect(["ready_to_publish", "completed"]).toContain(parsedRun.status);
  });
});
