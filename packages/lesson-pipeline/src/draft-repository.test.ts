import { describe, expect, test } from "vitest";

import { SupabaseDraftRepository } from "./draft-repository";

const clientWithRpc = (rpc: () => Promise<unknown>) => ({ rpc });

describe("draft compare-and-swap repository", () => {
  test("returns the atomically incremented revision", async () => {
    const repository = new SupabaseDraftRepository(
      clientWithRpc(() =>
        Promise.resolve({
          data: [{ new_revision: 3, saved_payload: { title: "latest" } }],
          error: null
        })
      ) as never
    );
    await expect(repository.compareAndSwap("draft-1", 2, { title: "latest" })).resolves.toEqual({
      revision: 3,
      payload: { title: "latest" }
    });
  });

  test("turns a stale write into DRAFT_VERSION_CONFLICT without fallback merge", async () => {
    const repository = new SupabaseDraftRepository(
      clientWithRpc(() =>
        Promise.resolve({
          data: null,
          error: { message: "DRAFT_VERSION_CONFLICT:4" }
        })
      ) as never
    );
    await expect(repository.compareAndSwap("draft-1", 2, { title: "stale" })).rejects.toMatchObject(
      {
        name: "DraftVersionConflictError",
        currentRevision: 4
      }
    );
  });
});
