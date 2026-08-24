export interface DraftPollingState {
  readonly draft: object | null;
  readonly status: string;
  readonly recovery?: object | null;
}

export function shouldPollForDraft(state: DraftPollingState | null): boolean {
  return !state || (!state.draft && state.status !== "failed" && !state.recovery);
}
