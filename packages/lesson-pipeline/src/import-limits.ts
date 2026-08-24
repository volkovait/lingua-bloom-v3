export const MAX_PDF_PAGES = 20;
export const MAX_PDF_BYTES = 52_428_800;
export const MAX_TEXT_CODE_POINTS = 500_000;
export const MAX_ANSWER_FIELDS = 500;

export type ImportLimitType = "pdfPages" | "pdfBytes" | "textCharacters" | "answerFields";

export class SourceTooLargeError extends Error {
  readonly code = "SOURCE_TOO_LARGE";
  readonly splitRequired = true;
  readonly partsBecomeSeparateLessons = true;

  constructor(
    readonly limitType: ImportLimitType,
    readonly limit: number,
    readonly actual: number
  ) {
    super(
      `Source exceeds the ${limitType} limit (${String(actual)} > ${String(limit)}); split it into separate lessons`
    );
    this.name = "SourceTooLargeError";
  }

  toResponse() {
    return {
      code: this.code,
      message: this.message,
      limitType: this.limitType,
      limit: this.limit,
      actual: this.actual,
      splitRequired: this.splitRequired,
      partsBecomeSeparateLessons: this.partsBecomeSeparateLessons
    } as const;
  }
}

export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length;
}

export function validatePdfByteSize(actual: number): void {
  assertLimit("pdfBytes", MAX_PDF_BYTES, actual);
}

export function validatePdfPageCount(actual: number): void {
  assertLimit("pdfPages", MAX_PDF_PAGES, actual);
}

export function validateTextCharacterCount(value: string): void {
  assertLimit("textCharacters", MAX_TEXT_CODE_POINTS, countUnicodeCodePoints(value));
}

export function validateAnswerFieldCount(actual: number): void {
  assertLimit("answerFields", MAX_ANSWER_FIELDS, actual);
}

export type AnswerFieldLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly createDraft: false;
      readonly failure: {
        readonly code: "SOURCE_TOO_LARGE";
        readonly kind: "terminal";
        readonly message: string;
        readonly manualResumeAllowed: false;
        readonly limitType: "answerFields";
        readonly limit: number;
        readonly actual: number;
      };
    };

export function evaluateAnswerFieldLimit(actual: number): AnswerFieldLimitDecision {
  if (actual <= MAX_ANSWER_FIELDS) return { allowed: true };
  const error = new SourceTooLargeError("answerFields", MAX_ANSWER_FIELDS, actual);
  return {
    allowed: false,
    createDraft: false,
    failure: {
      code: error.code,
      kind: "terminal",
      message: error.message,
      manualResumeAllowed: false,
      limitType: "answerFields",
      limit: error.limit,
      actual: error.actual
    }
  };
}

function assertLimit(limitType: ImportLimitType, limit: number, actual: number): void {
  if (actual > limit) throw new SourceTooLargeError(limitType, limit, actual);
}
