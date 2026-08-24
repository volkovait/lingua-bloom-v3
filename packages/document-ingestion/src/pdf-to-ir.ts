import type { DocumentIR, SourceBlock } from "@lingua-bloom/contracts";

import { orderBlocksByColumns } from "./reading-order";

export interface PdfTextItemInput {
  readonly text: string;
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly confidence?: number;
}

export interface PdfDocumentIrInput {
  readonly id: string;
  readonly sourceDocumentId: string;
}

export interface TextItemDocumentIrInput extends PdfDocumentIrInput {
  readonly pages: DocumentIR["pages"];
}

interface Line {
  readonly pageIndex: number;
  readonly items: PdfTextItemInput[];
}

const LINE_TOLERANCE = 3;
const TAB_GAP = 10;
const SPACE_GAP = 1.5;

export async function buildPdfDocumentIr(
  bytes: Uint8Array,
  input: PdfDocumentIrInput
): Promise<DocumentIR> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes, useWorkerFetch: false });
  try {
    const pdf = await loadingTask.promise;
    const pages: DocumentIR["pages"][number][] = [];
    const items: PdfTextItemInput[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        index: pageNumber - 1,
        width: round(viewport.width),
        height: round(viewport.height)
      });
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const itemHeight = typeof item.height === "number" ? item.height : 0;
        const transformHeight = numberAt(item.transform, 3);
        const height = Math.max(itemHeight, Math.abs(transformHeight));
        items.push({
          text: item.str,
          pageIndex: pageNumber - 1,
          x: numberAt(item.transform, 4),
          y: viewport.height - numberAt(item.transform, 5) - height,
          width: typeof item.width === "number" ? item.width : 0,
          height,
          confidence: 1
        });
      }
    }
    return createDocumentIrFromTextItems(items, { ...input, pages });
  } catch (error) {
    throw new Error("PDF is malformed or its text layer cannot be read", { cause: error });
  } finally {
    await loadingTask.destroy();
  }
}

export function createDocumentIrFromTextItems(
  items: readonly PdfTextItemInput[],
  input: TextItemDocumentIrInput
): DocumentIR {
  const blocks: SourceBlock[] = [];
  for (const page of input.pages) {
    const lines = groupIntoLines(
      items.filter((item) => item.pageIndex === page.index),
      page.width
    );
    const pageBlocks = lines.map((line, index) => lineToBlock(line, index));
    const ordered = orderBlocksByColumns(pageBlocks, page.width);
    ordered.forEach((block, index) => {
      blocks.push({
        ...block,
        id: `page:${String(page.index)}:block:${String(index)}`,
        order: blocks.length
      });
    });
  }
  return {
    schemaVersion: "1.0.0",
    id: input.id,
    sourceDocumentId: input.sourceDocumentId,
    pages: [...input.pages],
    blocks,
    warnings: []
  };
}

function groupIntoLines(items: readonly PdfTextItemInput[], pageWidth: number): Line[] {
  const sorted = [...items].sort((left, right) => left.y - right.y || left.x - right.x);
  const lines: { pageIndex: number; anchorY: number; items: PdfTextItemInput[] }[] = [];
  for (const item of sorted) {
    const line = lines.find(
      (candidate) =>
        candidate.pageIndex === item.pageIndex &&
        Math.abs(candidate.anchorY - item.y) <= LINE_TOLERANCE &&
        isSameColumn(candidate.items[0], item, pageWidth)
    );
    if (line) line.items.push(item);
    else lines.push({ pageIndex: item.pageIndex, anchorY: item.y, items: [item] });
  }
  return lines.map(({ pageIndex, items: lineItems }) => ({
    pageIndex,
    items: lineItems.sort((left, right) => left.x - right.x)
  }));
}

function isSameColumn(
  anchor: PdfTextItemInput | undefined,
  item: PdfTextItemInput,
  pageWidth: number
): boolean {
  if (!anchor) return false;
  return anchor.x < pageWidth / 2 === item.x < pageWidth / 2;
}

function lineToBlock(line: Line, order: number): SourceBlock {
  const first = line.items[0];
  if (!first) throw new Error("Cannot create a PDF block from an empty line");
  let rawText = first.text.trim();
  let previousRight = first.x + first.width;
  for (const item of line.items.slice(1)) {
    const gap = item.x - previousRight;
    rawText += `${gap >= TAB_GAP ? "\t" : gap >= SPACE_GAP ? " " : ""}${item.text.trim()}`;
    previousRight = Math.max(previousRight, item.x + item.width);
  }
  const x = Math.min(...line.items.map((item) => item.x));
  const y = Math.min(...line.items.map((item) => item.y));
  const right = Math.max(...line.items.map((item) => item.x + item.width));
  const bottom = Math.max(...line.items.map((item) => item.y + item.height));
  return {
    id: `unassigned:${String(order)}`,
    pageIndex: line.pageIndex,
    kind: "text",
    rawText,
    order,
    bbox: { x: round(x), y: round(y), width: round(right - x), height: round(bottom - y) },
    confidence: Math.min(...line.items.map((item) => item.confidence ?? 1))
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  return typeof value === "number" ? value : 0;
}
