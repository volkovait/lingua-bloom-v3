import { describe, expect, test } from "vitest";

import { validateSourceLineage } from "./source-lineage-validator";

const repository = {
  irBelongsToSource: () => Promise.resolve(true),
  getBlock: () =>
    Promise.resolve({
      rawTextLength: 10,
      pageIndex: 0,
      bbox: { x: 0, y: 0, width: 100, height: 20 }
    })
};

describe("repository-backed SourceRef lineage", () => {
  test("rejects ranges, pages, and geometry outside the immutable block", async () => {
    await expect(
      validateSourceLineage(
        [
          {
            sourceDocumentId: "source-1",
            documentIrId: "ir-1",
            blockId: "block-1",
            charStart: 0,
            charEnd: 11,
            pageIndex: 1,
            bbox: { x: 90, y: 0, width: 20, height: 20 }
          }
        ],
        "source-1",
        "ir-1",
        repository
      )
    ).resolves.toEqual([
      "SOURCE_RANGE_OUT_OF_BOUNDS:block-1",
      "SOURCE_PAGE_MISMATCH:block-1",
      "SOURCE_BBOX_OUT_OF_BOUNDS:block-1"
    ]);
  });
});
