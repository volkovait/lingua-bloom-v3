export interface DraftPollingState {
  readonly draft: object | null;
  readonly unknownLayoutReview?: object | null;
  readonly status: string;
  readonly recovery?: object | null;
}

export function shouldPollForDraft(state: DraftPollingState | null): boolean {
  return (
    !state ||
    (!state.draft && !state.unknownLayoutReview && state.status !== "failed" && !state.recovery)
  );
}
