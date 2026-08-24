import type { SourceRef } from "@lingua-bloom/contracts";

export interface SourceLineageRepository {
  getBlock(
    documentIrId: string,
    blockId: string
  ): Promise<{
    readonly rawTextLength: number;
    readonly pageIndex?: number | null;
    readonly bbox?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    } | null;
  } | null>;
  irBelongsToSource(documentIrId: string, sourceDocumentId: string): Promise<boolean>;
}

export async function validateSourceLineage(
  refs: readonly SourceRef[],
  expectedSourceDocumentId: string,
  expectedDocumentIrId: string,
  repository: SourceLineageRepository
): Promise<readonly string[]> {
  const failures: string[] = [];
  if (!(await repository.irBelongsToSource(expectedDocumentIrId, expectedSourceDocumentId))) {
    failures.push("DOCUMENT_IR_SOURCE_MISMATCH");
  }
  for (const ref of refs) {
    if (
      ref.sourceDocumentId !== expectedSourceDocumentId ||
      ref.documentIrId !== expectedDocumentIrId
    ) {
      failures.push(`CROSS_DOCUMENT_REF:${ref.blockId}`);
    } else {
      const block = await repository.getBlock(ref.documentIrId, ref.blockId);
      if (!block) {
        failures.push(`UNKNOWN_BLOCK_REF:${ref.blockId}`);
        continue;
      }
      if (
        (ref.charStart != null && ref.charStart > block.rawTextLength) ||
        (ref.charEnd != null && ref.charEnd > block.rawTextLength)
      ) {
        failures.push(`SOURCE_RANGE_OUT_OF_BOUNDS:${ref.blockId}`);
      }
      if (ref.pageIndex != null && ref.pageIndex !== block.pageIndex) {
        failures.push(`SOURCE_PAGE_MISMATCH:${ref.blockId}`);
      }
      if (ref.bbox && block.bbox && !contains(block.bbox, ref.bbox)) {
        failures.push(`SOURCE_BBOX_OUT_OF_BOUNDS:${ref.blockId}`);
      }
    }
  }
  return failures;
}

function contains(
  outer: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  inner: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
