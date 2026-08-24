import type { SourceDocument } from "@lingua-bloom/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PersistSourceInput, SourceRepository } from "./source-repository";

interface SourceRow {
  id: string;
  owner_id: string;
  kind: "pdf" | "text";
  content_hash: string;
  storage_ref: string;
  created_at: string;
}

const toDomain = (row: SourceRow): SourceDocument => ({
  id: row.id,
  ownerId: row.owner_id,
  kind: row.kind,
  contentHash: row.content_hash,
  storageRef: row.storage_ref,
  createdAt: row.created_at,
  retentionPolicy: "retainForProvenance"
});

export class SupabaseSourceRepository implements SourceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async persist(input: PersistSourceInput): Promise<SourceDocument> {
    const existing = await this.findByHash(input.ownerId, input.contentHash);
    if (existing) return existing;

    const sourceDocumentId = crypto.randomUUID();
    const extension = input.kind === "pdf" ? "pdf" : "txt";
    const storageRef = `${input.ownerId}/${sourceDocumentId}/original.${extension}`;
    const { error: storageError } = await this.supabase.storage
      .from("sources")
      .upload(storageRef, input.bytes, { contentType: input.mimeType, upsert: false });
    if (storageError) throw new Error(`Failed to persist source object: ${storageError.message}`);

    const { data, error } = await this.supabase
      .from("source_documents")
      .insert({
        id: sourceDocumentId,
        owner_id: input.ownerId,
        kind: input.kind,
        title: input.title,
        content_hash: input.contentHash,
        storage_ref: storageRef,
        byte_size: input.bytes.byteLength
      })
      .select("id,owner_id,kind,content_hash,storage_ref,created_at")
      .single();
    if (error) throw new Error(`Failed to persist source metadata: ${error.message}`);
    return toDomain(data);
  }

  async findById(ownerId: string, sourceDocumentId: string): Promise<SourceDocument | null> {
    const { data, error } = await this.supabase
      .from("source_documents")
      .select("id,owner_id,kind,content_hash,storage_ref,created_at")
      .eq("owner_id", ownerId)
      .eq("id", sourceDocumentId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read source metadata: ${error.message}`);
    return data ? toDomain(data) : null;
  }

  async readBytes(ownerId: string, sourceDocumentId: string): Promise<Uint8Array | null> {
    const source = await this.findById(ownerId, sourceDocumentId);
    if (!source) return null;
    const { data, error } = await this.supabase.storage.from("sources").download(source.storageRef);
    if (error) throw new Error(`Failed to read source object: ${error.message}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  private async findByHash(ownerId: string, contentHash: string): Promise<SourceDocument | null> {
    const { data, error } = await this.supabase
      .from("source_documents")
      .select("id,owner_id,kind,content_hash,storage_ref,created_at")
      .eq("owner_id", ownerId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) throw new Error(`Failed to deduplicate source: ${error.message}`);
    return data ? toDomain(data) : null;
  }
}
