# Feature Specification: Teacher Attempt History

**Status**: Clarified for implementation

## Clarifications

### Session 2026-09-02

- Manual Telegram retry, CSV export and aggregate statistics are excluded from the MVP.
- Search includes lesson title and student display name.
- Detail shows all accepted display values only for incorrect fields.
- Pending delivery state is refreshed on page reload; background polling is not required in MVP.
- Ambiguous provider outcomes are never retried automatically.

## User Stories

### US1 — Browse attempts
An authenticated teacher sees only attempts for owned lessons newest first and combines search,
lesson, result and Telegram filters.

### US2 — Inspect one attempt
The teacher sees immutable score and ordered responses. A foreign or unknown attempt returns 404.

### US3 — Recover Telegram delivery
Scheduled recovery finds old pending or abandoned sending records and delivers them at most once.

## Requirements

- **FR-001**: Routes MUST call requireTeacher and derive owner ID from the session.
- **FR-002**: Lists MUST use opaque cursor pagination, default 25 and maximum 100.
- **FR-003**: Search/filter state MUST remain in the URL and execute server-side.
- **FR-004**: DTOs MUST omit owner ID, fingerprint, raw result payload and Telegram secrets.
- **FR-005**: Detail MUST preserve response ordinal and show accepted values only after completion.
- **FR-006**: Responses MUST use private, no-store caching.
- **FR-007**: Attempts remain immutable and retained indefinitely; no delete/edit API is added.
- **FR-008**: Recovery MUST reset stale claims and never retry ambiguous outcomes.
- **FR-009**: Long Telegram results MUST be split below provider limits without splitting a field.
- **FR-010**: Desktop/mobile statuses MUST remain understandable without color.

## Non-Goals
Manual retry, CSV export, analytics, date filtering and deletion.

## Success Criteria
- Cross-tenant tests disclose zero foreign attempts.
- A 51-attempt fixture paginates without duplicates or omissions.
- Filters survive reload and return only matching rows.
- Multipart Telegram delivery uses bounded intact chunks.
- Recovery dispatches old pending work while grading remains successful on dispatch failure.
