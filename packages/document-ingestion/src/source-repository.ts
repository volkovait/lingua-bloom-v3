import type { SourceDocument } from "@lingua-bloom/contracts";

export interface PersistSourceInput {
  readonly ownerId: string;
  readonly title: string;
  readonly kind: "pdf" | "text";
  readonly contentHash: string;
  readonly bytes: Uint8Array;
  readonly mimeType: "application/pdf" | "text/plain";
}

export interface SourceRepository {
  persist(input: PersistSourceInput): Promise<SourceDocument>;
  findById(ownerId: string, sourceDocumentId: string): Promise<SourceDocument | null>;
  readBytes(ownerId: string, sourceDocumentId: string): Promise<Uint8Array | null>;
}
