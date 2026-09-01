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

export const PDF_DOCUMENT_IR_PARSER_VERSION = "pdf-layout/1.1.0";

const LINE_TOLERANCE = 3;
const TAB_GAP = 10;
const SPACE_GAP = 1.5;

export async function buildPdfDocumentIr(
  bytes: Uint8Array,
  input: PdfDocumentIrInput
): Promise<DocumentIR> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
      const pageItems: PdfTextItemInput[] = [];
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const itemHeight = typeof item.height === "number" ? item.height : 0;
        const transformHeight = numberAt(item.transform, 3);
        const height = Math.max(itemHeight, Math.abs(transformHeight));
        pageItems.push({
          text: item.str,
          pageIndex: pageNumber - 1,
          x: numberAt(item.transform, 4),
          y: viewport.height - numberAt(item.transform, 5) - height,
          width: typeof item.width === "number" ? item.width : 0,
          height,
          confidence: 1
        });
      }
      const operatorList = await page.getOperatorList();
      for (const rule of extractBlankRules(operatorList, OPS, viewport.height)) {
        const nearest = nearestTextLine(pageItems, rule.top);
        if (!nearest) continue;
        pageItems.push({
          text: "___",
          pageIndex: pageNumber - 1,
          x: rule.x,
          y: nearest.y,
          width: rule.width,
          height: nearest.height,
          confidence: 1
        });
      }
      items.push(...pageItems);
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
    parserVersion: PDF_DOCUMENT_IR_PARSER_VERSION,
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

interface PdfOperatorList {
  readonly fnArray: ArrayLike<number>;
  readonly argsArray: ArrayLike<unknown>;
}

interface PdfOps {
  readonly save: number;
  readonly restore: number;
  readonly transform: number;
  readonly constructPath: number;
  readonly stroke: number;
}

function extractBlankRules(
  operatorList: PdfOperatorList,
  ops: PdfOps,
  pageHeight: number
): { x: number; top: number; width: number }[] {
  type Matrix = [number, number, number, number, number, number];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const rules: { x: number; top: number; width: number }[] = [];
  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (fn === ops.save) {
      stack.push([...matrix]);
      continue;
    }
    if (fn === ops.restore) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === ops.transform && isNumberArray(args, 6)) {
      matrix = multiplyMatrices(matrix, args);
      continue;
    }
    if (fn !== ops.constructPath || !Array.isArray(args) || args[0] !== ops.stroke) continue;
    const bounds: unknown = args[2];
    if (!isNumberArray(bounds, 4)) continue;
    const start = transformPoint(matrix, numberAt(bounds, 0), numberAt(bounds, 1));
    const end = transformPoint(matrix, numberAt(bounds, 2), numberAt(bounds, 3));
    const width = Math.abs(end[0] - start[0]);
    const verticalDelta = Math.abs(end[1] - start[1]);
    if (width < 35 || width > 90 || verticalDelta > 1.5) continue;
    rules.push({ x: Math.min(start[0], end[0]), top: pageHeight - start[1], width });
  }
  return rules;
}

function nearestTextLine(items: readonly PdfTextItemInput[], ruleTop: number) {
  return items
    .map((item) => ({ item, distance: Math.abs(item.y + item.height - ruleTop) }))
    .filter(({ distance }) => distance <= 3)
    .sort((left, right) => left.distance - right.distance)[0]?.item;
}

function isNumberArray(value: unknown, minimumLength: number): value is ArrayLike<number> {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return false;
  const entries = Array.from(value as ArrayLike<unknown>);
  return entries.length >= minimumLength && entries.every((entry) => typeof entry === "number");
}

function multiplyMatrices(
  left: ArrayLike<number>,
  right: ArrayLike<number>
): [number, number, number, number, number, number] {
  const l0 = numberAt(left, 0);
  const l1 = numberAt(left, 1);
  const l2 = numberAt(left, 2);
  const l3 = numberAt(left, 3);
  const l4 = numberAt(left, 4);
  const l5 = numberAt(left, 5);
  const r0 = numberAt(right, 0);
  const r1 = numberAt(right, 1);
  const r2 = numberAt(right, 2);
  const r3 = numberAt(right, 3);
  const r4 = numberAt(right, 4);
  const r5 = numberAt(right, 5);
  return [
    l0 * r0 + l2 * r1,
    l1 * r0 + l3 * r1,
    l0 * r2 + l2 * r3,
    l1 * r2 + l3 * r3,
    l0 * r4 + l2 * r5 + l4,
    l1 * r4 + l3 * r5 + l5
  ];
}

function transformPoint(matrix: ArrayLike<number>, x: number, y: number): [number, number] {
  return [
    numberAt(matrix, 0) * x + numberAt(matrix, 2) * y + numberAt(matrix, 4),
    numberAt(matrix, 1) * x + numberAt(matrix, 3) * y + numberAt(matrix, 5)
  ];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  return typeof value === "number" ? value : 0;
}
