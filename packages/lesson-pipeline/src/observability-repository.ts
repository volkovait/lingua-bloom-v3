import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GenerationManifestSchema,
  RunEventSchema,
  type GenerationManifest,
  type RunEvent
} from "./observability";

const SENSITIVE_KEY =
  /(source(text|content)?|accepted(values?)?|answer|secret|password|signed.?url|storage.?url|(session|access|refresh|auth).?token)/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(nested)
      ])
    );
  }
  return value;
}

export interface ObservabilityRepository {
  appendEvent(ownerId: string, event: RunEvent): Promise<void>;
  finalizeManifest(ownerId: string, manifest: GenerationManifest): Promise<void>;
}

export class SupabaseObservabilityRepository implements ObservabilityRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async appendEvent(ownerId: string, event: RunEvent): Promise<void> {
    const safeEvent = RunEventSchema.parse(redactSensitive(event));
    const { error } = await this.supabase.from("run_events").insert({
      run_id: safeEvent.runId,
      owner_id: ownerId,
      sequence: safeEvent.sequence,
      event_type: safeEvent.type,
      payload: safeEvent
    });
    if (error && error.code !== "23505")
      throw new Error(`Failed to append run event: ${error.message}`);
  }

  async finalizeManifest(ownerId: string, manifest: GenerationManifest): Promise<void> {
    const safeManifest = GenerationManifestSchema.parse(redactSensitive(manifest));
    const { error } = await this.supabase.from("generation_manifests").insert({
      run_id: safeManifest.runId,
      owner_id: ownerId,
      payload: safeManifest,
      finalized_at: safeManifest.finalizedAt
    });
    if (error && error.code !== "23505")
      throw new Error(`Failed to finalize manifest: ${error.message}`);
  }
}
