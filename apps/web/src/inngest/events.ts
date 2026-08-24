export const INGESTION_IMPORT_REQUESTED = "ingestion/import.requested" as const;
export const INGESTION_REVIEW_SUBMITTED = "ingestion/review.submitted" as const;
export const INGESTION_RESUME_REQUESTED = "ingestion/resume.requested" as const;

export interface ImportRequestedEventData {
  readonly ownerId: string;
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly kind: "pdf" | "text";
  readonly requestFingerprint: string;
}

export interface ReviewSubmittedEventData {
  readonly ownerId: string;
  readonly runId: string;
  readonly revision: number;
}

export interface ResumeRequestedEventData {
  readonly ownerId: string;
  readonly runId: string;
}
