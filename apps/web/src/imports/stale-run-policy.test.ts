import { describe, expect, test } from "vitest";

import {
  ACCEPTED_STALE_AFTER_MS,
  PROCESSING_STALE_AFTER_MS,
  getStaleRunRecovery
} from "./stale-run-policy";

const UPDATED_AT = "2026-08-24T12:00:00.000Z";
const updatedAtMs = Date.parse(UPDATED_AT);

describe("stale import run policy", () => {
  test("marks accepted as stale only after the dispatch grace period", () => {
    const state = { status: "accepted", updatedAt: UPDATED_AT, draftExists: false };
    expect(getStaleRunRecovery(state, updatedAtMs + ACCEPTED_STALE_AFTER_MS - 1)).toBeNull();
    expect(getStaleRunRecovery(state, updatedAtMs + ACCEPTED_STALE_AFTER_MS)).toEqual({
      kind: "dispatch_not_started",
      redispatchAllowed: true,
      staleSince: new Date(updatedAtMs + ACCEPTED_STALE_AFTER_MS).toISOString()
    });
  });

  test("uses a longer heartbeat threshold for processing", () => {
    const state = { status: "processing", updatedAt: UPDATED_AT, draftExists: false };
    expect(getStaleRunRecovery(state, updatedAtMs + PROCESSING_STALE_AFTER_MS - 1)).toBeNull();
    expect(getStaleRunRecovery(state, updatedAtMs + PROCESSING_STALE_AFTER_MS)).toMatchObject({
      kind: "worker_heartbeat_expired",
      redispatchAllowed: true
    });
  });

  test("never offers redispatch after a draft or for another lifecycle state", () => {
    expect(
      getStaleRunRecovery(
        { status: "accepted", updatedAt: UPDATED_AT, draftExists: true },
        updatedAtMs + ACCEPTED_STALE_AFTER_MS
      )
    ).toBeNull();
    expect(
      getStaleRunRecovery(
        { status: "failed", updatedAt: UPDATED_AT, draftExists: false },
        updatedAtMs + PROCESSING_STALE_AFTER_MS
      )
    ).toBeNull();
  });

  test("does not recover malformed timestamps", () => {
    expect(
      getStaleRunRecovery(
        { status: "accepted", updatedAt: "invalid", draftExists: false },
        updatedAtMs + ACCEPTED_STALE_AFTER_MS
      )
    ).toBeNull();
  });
});
