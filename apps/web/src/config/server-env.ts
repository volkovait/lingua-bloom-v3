import "server-only";

import { z } from "zod";

const ServerEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1)
});

export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= ServerEnvironmentSchema.parse(process.env);
  return cachedEnvironment;
}
