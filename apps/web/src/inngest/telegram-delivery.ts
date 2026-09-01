import { z } from "zod";

import { createAdminSupabaseClient } from "@/src/supabase/admin";
import { sendTelegramMessage, TelegramProviderError } from "@/src/telegram/client";
import { buildTelegramAttemptMessage } from "@/src/telegram/message";
import { resolveTelegramCredentials } from "@/src/telegram/settings-repository";

import { inngest } from "./client";

const EventSchema = z.object({ attemptId: z.uuid() });
const AttemptSchema = z.object({
  owner_id: z.string(),
  lesson_id: z.string(),
  lesson_version: z.number(),
  student_display_name: z.string(),
  correct_count: z.number(),
  total_count: z.number()
});
const ResponseSchema = z.object({
  ordinal: z.number(),
  submitted_value: z.unknown(),
  is_correct: z.boolean(),
  accepted_display_values: z.array(z.string())
});

export const telegramAttemptDelivery = inngest.createFunction(
  { id: "telegram-attempt-delivery", retries: 0 },
  { event: "student/attempt.completed" },
  async ({ event }) => {
    const { attemptId } = EventSchema.parse(event.data);
    const supabase = createAdminSupabaseClient();
    const claimToken = crypto.randomUUID();
    const claim = await supabase.rpc("claim_telegram_delivery", {
      p_attempt_id: attemptId,
      p_claim_token: claimToken
    });
    if (claim.error || !Array.isArray(claim.data) || claim.data.length === 0)
      return { claimed: false };
    const claimRow = z.object({ outbox_id: z.string(), owner_id: z.string() }).parse(claim.data[0]);
    try {
      const credentials = await resolveTelegramCredentials(claimRow.owner_id);
      if (!credentials) {
        await complete(supabase, claimRow.outbox_id, "skipped");
        return { claimed: true, status: "skipped" };
      }
      const attemptResult = await supabase
        .from("student_attempts")
        .select("owner_id,lesson_id,lesson_version,student_display_name,correct_count,total_count")
        .eq("id", attemptId)
        .single();
      if (attemptResult.error) throw new Error("attempt_read");
      const attempt = AttemptSchema.parse(attemptResult.data);
      const [lessonResult, rowsResult] = await Promise.all([
        supabase.from("lessons").select("title").eq("id", attempt.lesson_id).single(),
        supabase
          .from("student_attempt_responses")
          .select("ordinal,submitted_value,is_correct,accepted_display_values")
          .eq("attempt_id", attemptId)
          .order("ordinal")
      ]);
      if (lessonResult.error || rowsResult.error) throw new Error("attempt_detail_read");
      const rows = z.array(ResponseSchema).parse(rowsResult.data);
      const providerMessageId = await sendTelegramMessage({
        ...credentials,
        text: buildTelegramAttemptMessage({
          lessonTitle: z.object({ title: z.string() }).parse(lessonResult.data).title,
          lessonVersion: attempt.lesson_version,
          studentName: attempt.student_display_name,
          correctCount: attempt.correct_count,
          totalCount: attempt.total_count,
          rows: rows.map((row) => ({
            ordinal: row.ordinal,
            submitted: formatSubmitted(row.submitted_value),
            correct: row.is_correct,
            acceptedValues: row.accepted_display_values
          }))
        })
      });
      await complete(supabase, claimRow.outbox_id, "sent", {
        provider_message_id: providerMessageId
      });
      return { claimed: true, status: "sent" };
    } catch (error) {
      await complete(supabase, claimRow.outbox_id, "failed", {
        failure_category: error instanceof TelegramProviderError ? error.category : "internal"
      });
      return { claimed: true, status: "failed" };
    }
  }
);

async function complete(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  id: string,
  status: "sent" | "skipped" | "failed",
  extra: Record<string, string> = {}
) {
  await supabase
    .from("telegram_delivery_outbox")
    .update({ status, completed_at: new Date().toISOString(), ...extra })
    .eq("id", id);
}

function formatSubmitted(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(" ");
  return typeof value === "string" ? value : JSON.stringify(value);
}
