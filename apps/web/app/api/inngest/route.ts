import { serve } from "inngest/next";

import { inngest } from "@/src/inngest/client";
import { reliableIngestion } from "@/src/inngest/reliable-ingestion";
import { telegramAttemptDelivery } from "@/src/inngest/telegram-delivery";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reliableIngestion, telegramAttemptDelivery]
});
