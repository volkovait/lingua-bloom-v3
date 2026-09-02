import { z } from "zod";

import { createAdminSupabaseClient } from "@/src/supabase/admin";
import { inngest } from "./client";

const RecoveryRowSchema = z.object({ attempt_id: z.string() });

export const telegramDeliveryRecovery = inngest.createFunction(
  { id: "telegram-delivery-recovery", retries: 1 },
  { cron: "*/5 * * * *" },
  async () => {
    const result = await createAdminSupabaseClient().rpc("recover_stale_telegram_deliveries");
    if (result.error) throw new Error("TELEGRAM_RECOVERY_READ_FAILED");
    const rows = z.array(RecoveryRowSchema).parse(result.data);
    if (rows.length > 0)
      await inngest.send(
        rows.map((row) => ({
          name: "student/attempt.completed",
          data: { attemptId: row.attempt_id }
        }))
      );
    return { recovered: rows.length };
  }
);
