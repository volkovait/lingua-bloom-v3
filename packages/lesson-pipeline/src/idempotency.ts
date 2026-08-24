import { createHash } from "node:crypto";

export interface ImportFingerprintInput {
  readonly title: string;
  readonly kind: "pdf" | "text";
  readonly contentHash: string;
}

export function createContentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createRequestFingerprint(input: ImportFingerprintInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title.trim(),
        kind: input.kind,
        contentHash: input.contentHash
      })
    )
    .digest("hex");
}

export function createOwnerScopedIdempotencyKey(ownerId: string, clientKey: string): string {
  if (clientKey.length < 16 || clientKey.length > 128)
    throw new Error("Invalid idempotency key length");
  return createHash("sha256").update(ownerId).update("\0").update(clientKey).digest("hex");
}

export function createPublishUniquenessKey(runId: string, draftVersion: number): string {
  if (!Number.isInteger(draftVersion) || draftVersion < 1) throw new Error("Invalid draft version");
  return `${runId}:${String(draftVersion)}`;
}

export type ReplayResolution<T> =
  | { readonly kind: "create" }
  | { readonly kind: "replay"; readonly value: T }
  | { readonly kind: "conflict" };

export function resolveIdempotentReplay<T>(
  existing: { readonly fingerprint: string; readonly value: T } | null,
  incomingFingerprint: string
): ReplayResolution<T> {
  if (!existing) return { kind: "create" };
  return existing.fingerprint === incomingFingerprint
    ? { kind: "replay", value: existing.value }
    : { kind: "conflict" };
}
