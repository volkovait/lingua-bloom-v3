export const ACCEPTED_STALE_AFTER_MS = 30_000;
export const PROCESSING_STALE_AFTER_MS = 180_000;

export interface StaleRunState {
  readonly status: string;
  readonly updatedAt: string;
  readonly draftExists: boolean;
}

export interface StaleRunRecovery {
  readonly kind: "dispatch_not_started" | "worker_heartbeat_expired";
  readonly redispatchAllowed: true;
  readonly staleSince: string;
}

export function getStaleRunRecovery(
  state: StaleRunState,
  now = Date.now()
): StaleRunRecovery | null {
  if (state.draftExists) return null;
  const updatedAt = Date.parse(state.updatedAt);
  if (!Number.isFinite(updatedAt)) return null;

  const threshold =
    state.status === "accepted"
      ? ACCEPTED_STALE_AFTER_MS
      : state.status === "processing"
        ? PROCESSING_STALE_AFTER_MS
        : null;
  if (threshold === null || now - updatedAt < threshold) return null;

  return {
    kind: state.status === "accepted" ? "dispatch_not_started" : "worker_heartbeat_expired",
    redispatchAllowed: true,
    staleSince: new Date(updatedAt + threshold).toISOString()
  };
}
