import type { SupabaseClient } from "@supabase/supabase-js";

export class DraftVersionConflictError extends Error {
  constructor(readonly currentRevision?: number) {
    super("The draft was changed by another editor");
    this.name = "DraftVersionConflictError";
  }
}

export class DraftNotOwnedError extends Error {
  constructor() {
    super("The draft does not belong to the authenticated teacher");
    this.name = "DraftNotOwnedError";
  }
}

export interface SavedDraft<T> {
  readonly revision: number;
  readonly payload: T;
}

export class SupabaseDraftRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async compareAndSwap<T>(
    draftId: string,
    expectedRevision: number,
    payload: T
  ): Promise<SavedDraft<T>> {
    const { data, error } = (await this.supabase.rpc("compare_and_swap_lesson_draft", {
      p_draft_id: draftId,
      p_expected_revision: expectedRevision,
      p_payload: payload
    })) as { data: unknown; error: { message: string } | null };
    if (error?.message.includes("DRAFT_VERSION_CONFLICT")) {
      const currentRevision = Number(error.message.match(/DRAFT_VERSION_CONFLICT:(\d+)/)?.[1]);
      throw new DraftVersionConflictError(
        Number.isInteger(currentRevision) ? currentRevision : undefined
      );
    }
    if (error?.message.includes("DRAFT_NOT_OWNED")) throw new DraftNotOwnedError();
    if (error) throw new Error(`Failed to save draft: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as
      { new_revision: number; saved_payload: T } | undefined;
    if (!row) throw new Error("Draft compare-and-swap returned no row");
    return { revision: row.new_revision, payload: row.saved_payload };
  }
}
