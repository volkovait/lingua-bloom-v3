export const MAX_PDF_PAGES = 5;
export const MAX_PDF_BYTES = 52_428_800;
export const MAX_TEXT_CODE_POINTS = 30_000;
export const MAX_ANSWER_FIELDS = 500;

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function countUnicodeCodePointsAfterLineEndingNormalization(value: string): number {
  return Array.from(normalizeLineEndings(value)).length;
}
