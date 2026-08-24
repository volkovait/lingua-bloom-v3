import type { DocumentIR, SourceRef, ValidationIssue } from "@lingua-bloom/contracts";

const LOW_CONFIDENCE_THRESHOLD = 0.8;

export function evaluatePdfTextLayer(document: DocumentIR): ValidationIssue[] {
  const documentIrId = document.id ?? `unpersisted:${document.sourceDocumentId}`;
  const textBlocks = document.blocks.filter(
    (block) => block.kind === "text" && block.rawText.trim().length > 0
  );
  if (textBlocks.length === 0) {
    return [
      {
        id: `issue:${document.sourceDocumentId}:ocr-required`,
        code: "OCR_REQUIRED",
        severity: "blocking",
        entityIds: [document.sourceDocumentId],
        evidence: [],
        message: "PDF has no usable text layer; upload a text PDF or paste the source text",
        resolution: "open"
      }
    ];
  }

  return textBlocks
    .filter((block) => block.confidence != null && block.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((block) => ({
      id: `issue:${block.id}:low-confidence`,
      code: "READING_ORDER_UNCERTAIN" as const,
      severity: "warning" as const,
      entityIds: [block.id],
      evidence: [sourceRef(document.sourceDocumentId, documentIrId, block)],
      message: "PDF text or reading order has low confidence and requires teacher review",
      resolution: "open" as const
    }));
}

function sourceRef(
  sourceDocumentId: string,
  documentIrId: string,
  block: DocumentIR["blocks"][number]
): SourceRef {
  return {
    sourceDocumentId,
    documentIrId,
    blockId: block.id,
    pageIndex: block.pageIndex ?? null,
    bbox: block.bbox ?? null
  };
}
