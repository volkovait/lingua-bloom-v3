import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnedResourceTable = "source_documents" | "pipeline_runs" | "lesson_drafts" | "lessons";

export class ResourceNotOwnedError extends Error {
  constructor() {
    super("The requested resource is not owned by the authenticated teacher");
    this.name = "ResourceNotOwnedError";
  }
}

export async function requireOwnedResource(
  supabase: SupabaseClient,
  ownerId: string,
  table: OwnedResourceTable,
  resourceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select("owner_id")
    .eq("id", resourceId)
    .maybeSingle();
  const row = data as { owner_id?: unknown } | null;
  if (error || typeof row?.owner_id !== "string" || row.owner_id !== ownerId) {
    throw new ResourceNotOwnedError();
  }
}
