export type FailureKind = "retriable" | "terminal";

export interface FailureInfo {
  readonly code: string;
  readonly kind: FailureKind;
  readonly message: string;
  readonly manualResumeAllowed: boolean;
  readonly cause?: unknown;
  readonly limitType?: "pdfPages" | "pdfBytes" | "textCharacters" | "answerFields";
  readonly limit?: number;
  readonly actual?: number;
}

export class DomainError extends Error {
  readonly code: string;
  readonly kind: FailureKind;
  readonly manualResumeAllowed: boolean;

  constructor(failure: FailureInfo) {
    super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause });
    this.name = "DomainError";
    this.code = failure.code;
    this.kind = failure.kind;
    this.manualResumeAllowed = failure.manualResumeAllowed;
  }
}

export const terminalFailure = (code: string, message: string, cause?: unknown): FailureInfo => ({
  code,
  kind: "terminal",
  message,
  manualResumeAllowed: false,
  ...(cause === undefined ? {} : { cause })
});

export const retriableFailure = (code: string, message: string, cause?: unknown): FailureInfo => ({
  code,
  kind: "retriable",
  message,
  manualResumeAllowed: true,
  ...(cause === undefined ? {} : { cause })
});
