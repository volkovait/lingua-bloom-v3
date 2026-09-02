import type { DocumentIR, SourceBlock } from "@lingua-bloom/contracts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { buildStructuralClassificationRequest, planStructuralWindows } from "./window-planner";

describe("structural window planner", () => {
  test("preserves complete stable membership for arbitrary bounded documents", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 180 }), (blockCount) => {
        const input = makeDocument(
          Array.from({ length: blockCount }, (_, index) => block(index, `Block ${String(index)}`))
        );
        const first = planStructuralWindows(input);
        const second = planStructuralWindows(input);
        expect(first).toEqual(second);
        expect(new Set(first.flatMap((window) => window.blockIds)).size).toBe(blockCount);
        expect(first.every((window) => window.blocks.length <= 64)).toBe(true);
        expect(first.every((window) => window.estimatedInputTokens <= 12_000)).toBe(true);
      })
    );
  });

  test("creates stable bounded windows with explicit overlap and complete membership", () => {
    const document = makeDocument(
      Array.from({ length: 70 }, (_, index) => block(index, `Line ${String(index)}`))
    );
    const first = planStructuralWindows(document);
    const second = planStructuralWindows(document);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]?.blocks).toHaveLength(64);
    expect(first[0]?.overlapAfter).toHaveLength(8);
    expect(first[1]?.overlapBefore).toEqual(first[0]?.overlapAfter);
    expect(new Set(first.flatMap((window) => window.blockIds)).size).toBe(70);
    expect(first.every((window) => window.estimatedInputTokens <= 12_000)).toBe(true);
    const firstWindow = first[0];
    if (!firstWindow) throw new Error("expected a structural window");
    expect(buildStructuralClassificationRequest(firstWindow, "model:1")).toMatchObject({
      kind: "structuralClassificationRequest",
      profileVersion: "structure-v2",
      modelId: "model:1",
      blocks: { length: 64 }
    });
  });

  test("keeps a cross-page exercise boundary in neighbouring windows", () => {
    const blocks = Array.from({ length: 70 }, (_, index) =>
      block(
        index,
        index === 62
          ? "Complete with words:"
          : index === 64
            ? "1. I ___ here."
            : `Line ${String(index)}`,
        index < 64 ? 0 : 1
      )
    );
    const windows = planStructuralWindows(makeDocument(blocks));
    expect(windows[0]?.blockIds).toContain("block:62");
    expect(windows[1]?.blockIds).toContain("block:62");
    expect(windows[0]?.blockIds).not.toContain("block:64");
    expect(windows[1]?.blockIds).toContain("block:64");
  });

  test("honours the token estimate even when block count is small", () => {
    const document = makeDocument([
      block(0, "字".repeat(4_000)),
      block(1, "字".repeat(4_000)),
      block(2, "字".repeat(4_000)),
      block(3, "字".repeat(4_000))
    ]);
    const windows = planStructuralWindows(document);
    expect(windows[0]?.estimatedInputTokens).toBe(12_000);
    expect(windows[1]?.blockIds).toContain("block:3");
    expect(windows.every((window) => window.estimatedInputTokens <= 12_000)).toBe(true);
  });

  test("rejects a single oversized block instead of creating an unbounded request", () => {
    expect(() => planStructuralWindows(makeDocument([block(0, "字".repeat(12_001))]))).toThrow(
      "exceeds the structural window token limit"
    );
  });
});

function makeDocument(blocks: SourceBlock[]): DocumentIR {
  return {
    schemaVersion: "1.0.0",
    parserVersion: "test/1.0.0",
    sourceKind: "pdf",
    id: "ir:window-test",
    sourceDocumentId: "source:window-test",
    pages: [
      { index: 0, width: 600, height: 800 },
      { index: 1, width: 600, height: 800 }
    ],
    blocks,
    warnings: []
  };
}

function block(order: number, rawText: string, pageIndex = 0): SourceBlock {
  return {
    id: `block:${String(order)}`,
    pageIndex,
    kind: "text",
    rawText,
    order,
    bbox: null,
    confidence: 1
  };
}
