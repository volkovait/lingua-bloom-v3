import { serve } from "inngest/next";

import { inngest } from "@/src/inngest/client";
import { reliableIngestion } from "@/src/inngest/reliable-ingestion";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [reliableIngestion] });
