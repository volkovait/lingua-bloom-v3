export const INGESTION_IMPORT_REQUESTED = "ingestion/import.requested" as const;

export interface ImportRequestedEventData {
  readonly ownerId: string;
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly kind: "pdf" | "text";
  readonly requestFingerprint: string;
}
