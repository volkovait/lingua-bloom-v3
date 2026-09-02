# Feature Specification: Student Attempt Grading and Telegram Results

**Feature Branch**: `003-student-attempt-grading`

**Created**: 2026-09-01

**Status**: In progress — product defaults confirmed on 2026-09-01

**Input**: Add deterministic checking to public lessons, visually mark correct and incorrect
responses, move focus and scroll to the first error, and let each teacher configure personal
Telegram credentials for result notifications.

## Clarifications

### Session 2026-09-01

The teacher confirmed the following product decisions:

1. A student enters a required display name before submitting; it is limited to 120 characters and
   appears in the teacher's Telegram notification.
2. One click on `Завершить и проверить` creates one immutable attempt. The student may start a new
   attempt with `Пройти ещё раз`; editing an already graded attempt is not supported.
3. Score granularity is one point per answer field. An exercise with several fields may be partially
   correct; the summary shows `correct fields / total fields`.
4. After submission, an incorrect field may reveal its accepted answer values. Answer keys remain
   absent from the lesson payload and unavailable before a completed attempt.
5. Telegram delivery is optional and MUST NOT block grading. If credentials are absent, disabled or
   temporarily unavailable, the student still receives the complete result.
6. Attempts, including student display name and submitted answers, are retained indefinitely. Telegram keeps delivered messages according to Telegram and teacher-controlled chat policies.
7. Anonymous students remain unauthenticated. The public endpoint is protected with body limits,
   idempotency and privacy-preserving rate limits.

### Session 2026-09-02

- Q: Should `К списку уроков` be visible only to an authenticated teacher or also to anonymous
  students? → A: Only to an authenticated teacher; anonymous students do not see teacher-library
  navigation.
- Q: How should a library with hundreds of lessons load? → A: Load ordered pages of 24 items
  automatically on scroll, with an accessible `Показать ещё` fallback.

## User Scenarios & Testing

### User Story 1 - Student checks a published lesson (Priority: P1)

An anonymous student opens a public lesson, fills its fields and submits one attempt. The server
grades the immutable published version. The page shows a summary and marks every response as correct
or incorrect without relying on color alone.

**Why this priority**: A test without trustworthy grading is not a complete student experience.

**Independent Test**: Open a published lesson anonymously, submit a mix of correct, incorrect and
blank values, and verify the server-computed score and per-field result against the internal answer
records while the pre-submit student payload contains no answers.

**Acceptance Scenarios**:

1. **Given** a current published lesson, **When** the student submits valid responses, **Then** the
   server binds the attempt to that immutable lesson version and returns deterministic per-field
   results and a server-computed score.
2. **Given** correct and incorrect responses, **When** the result is rendered, **Then** each field
   has a green or red state plus an icon and text label; the exercise has `correct`, `partial` or
   `incorrect` status derived from its fields.
3. **Given** at least one incorrect or blank field, **When** grading finishes, **Then** focus and a
   smooth scroll move to the first incorrect field in document order, respecting reduced-motion
   preference and without trapping keyboard focus.
4. **Given** all fields are correct, **When** grading finishes, **Then** focus moves to the result
   summary and no error scroll occurs.
5. **Given** an English free-text answer differs only in supported case, whitespace, terminal
   punctuation or documented question-form normalization, **When** it is graded, **Then** the
   existing versioned subject adapter accepts it; unsupported tense, word order or meaning changes
   remain incorrect.
6. **Given** the page was loaded for lesson version N and version N+1 is published before submit,
   **When** the student submits, **Then** the attempt is graded against version N rather than a
   different answer layout.
7. **Given** the same idempotency key and identical payload are submitted again, **When** the request
   is replayed, **Then** the same attempt result is returned and no duplicate attempt or notification
   is created; a different payload with the same key returns `409`.

---

### User Story 2 - Teacher configures Telegram notifications (Priority: P2)

An authenticated teacher opens profile settings, stores a Bot Token and Chat ID, enables or disables
notifications, and sends a test message before sharing lessons.

**Why this priority**: Personal credentials route results to the correct teacher without a global bot
configuration or cross-tenant access.

**Independent Test**: As teacher A, save and test credentials; reload the page and verify only
`tokenConfigured` is returned. As teacher B and as an anonymous user, verify settings and test-send
access is denied.

**Acceptance Scenarios**:

1. **Given** an authenticated teacher, **When** they open `/settings/telegram`, **Then** the profile
   navigation and page show enablement, Chat ID, masked token state, setup instructions and a test
   action.
2. **Given** a valid new Bot Token and Chat ID, **When** settings are saved, **Then** the token is
   encrypted server-side, is never returned to the browser, and the response contains only
   `tokenConfigured` and sanitized bot metadata.
3. **Given** an existing configured token, **When** the teacher changes only Chat ID or enablement,
   **Then** the existing token is retained; explicit replacement requires a new token.
4. **Given** invalid credentials or a Telegram provider failure, **When** the teacher tests them,
   **Then** the page shows a sanitized actionable error without logging or returning the token.
5. **Given** two teachers, **When** either reads, writes or tests settings, **Then** ownership is
   derived from the server-verified session and cross-tenant access is impossible.

---

### User Story 3 - Teacher receives a trustworthy result (Priority: P3)

After a student attempt is graded, the lesson owner receives a Telegram message containing the
lesson title and version, student display name, score, and an ordered answer breakdown.

**Why this priority**: The teacher needs usable results, but notification failure must not compromise
the student's primary grading journey.

**Independent Test**: Submit a graded attempt for a lesson whose owner has working credentials and
verify one escaped Telegram message derived entirely from the server grading record. Repeat with
disabled, invalid and unavailable Telegram configurations and verify grading remains successful.

**Acceptance Scenarios**:

1. **Given** enabled valid credentials, **When** a new attempt is committed, **Then** one delivery job
   is claimed for that attempt and the message contains only server-derived score and results.
2. **Given** Telegram is disabled or not configured, **When** an attempt is graded, **Then** the
   attempt completes and its delivery status is `skipped` without exposing configuration to the
   student.
3. **Given** Telegram fails, **When** delivery is attempted, **Then** grading remains completed,
   delivery becomes `failed` with a sanitized reason, and secrets, student answers and names do not
   appear in logs.
4. **Given** untrusted student text contains HTML or Telegram markup, **When** the notification is
   built, **Then** all dynamic content is escaped and cannot alter message structure.

### User Story 4 - Teacher navigates and searches the lesson library (Priority: P2)

An authenticated teacher returns from a published lesson preview to the lesson library, sees
published lessons before editable imports, and narrows the library by title and lifecycle status.

**Independent Test**: Sign in as a teacher with published lessons and active imports, open a public
lesson, return to `/lessons`, then verify published items precede drafts and title/status filters
produce only matching owner-scoped items while an anonymous student sees no teacher navigation.

**Acceptance Scenarios**:

1. **Given** an authenticated teacher viewing a public lesson, **When** the page renders, **Then** it
   provides a direct `К списку уроков` link; the same teacher-only navigation is absent anonymously.
2. **Given** published lessons and editable imports, **When** `/lessons` renders, **Then** the
   published section appears before the drafts/imports section regardless of creation time.
3. **Given** a title query and/or status filter, **When** the teacher applies the filters, **Then**
   only case-insensitive title matches with the selected exact status remain and the filter state is
   represented in the URL.
4. **Given** no matching lessons, **When** filtering completes, **Then** an explicit empty result and
   a reset action are shown without losing the original lessons.
5. **Given** more than 24 matching items, **When** the teacher approaches the end of the current
   results, **Then** the next ordered page of 24 loads automatically while a keyboard-operable
   `Показать ещё` action provides the same behavior without requiring scroll observation.

### Edge Cases

- Blank fields count as incorrect and participate in first-error navigation.
- Unknown field IDs, duplicate field IDs, more than 500 responses, oversized values and response
  kinds incompatible with the published contract are rejected before persistence.
- A submitted choice must resolve to an option or shared-entry ID belonging to that exact exercise
  and lesson version.
- Multiple accepted text values are evaluated through the versioned grading adapter; the raw answer
  is never compared with locale-sensitive implicit rules.
- A lesson that is unknown, has never been published, or has an invalid public ID returns `404`.
- Concurrent identical submissions converge on one attempt; concurrent conflicting submissions with
  one idempotency key do not partially write.
- A notification that may already have reached Telegram after an ambiguous network failure is not
  automatically resent, preventing duplicate teacher messages.
- JavaScript or Telegram outages do not expose answer keys through the public lesson endpoint.

## Requirements

### Functional Requirements

- **FR-001**: The public student page MUST provide a `Завершить и проверить` action and require the
  confirmed student identity fields before submission.
- **FR-002**: Grading MUST run on the server against the immutable internal `LessonSpec` version that
  produced the page; the client MUST NOT submit or determine correctness, score or accepted answers.
- **FR-003**: The request MUST contain a client-generated attempt ID/idempotency key, lesson version
  and at most one response for every addressable response field.
- **FR-004**: The grader MUST use stable IDs for choice-like interactions and versioned explicit
  adapters for text, ordered-token and future discipline-specific interactions.
- **FR-005**: Score MUST be calculated per answer field and response payloads MUST provide field and
  exercise states sufficient for accessible `correct`, `partial` and `incorrect` rendering.
- **FR-006**: Before completion, public lesson and API responses MUST contain no accepted values,
  correct option IDs, answer provenance or other answer-key material.
- **FR-007**: A completed attempt response MAY reveal accepted display answers only for its own
  incorrect fields and MUST contain no provenance, source references or answers from other versions.
- **FR-008**: After grading, the page MUST focus and scroll to the first incorrect field; if none
  exists it MUST focus the summary. Status MUST be conveyed by text/icon and ARIA semantics in
  addition to color, with reduced-motion and keyboard behavior tested.
- **FR-009**: A graded attempt MUST be immutable, server timestamped, bound to lesson/version/owner,
  and idempotent. A retry with the same key and fingerprint MUST return the stored result.
- **FR-010**: The public attempt endpoint MUST enforce strict schemas, 500-field and value-size limits,
  same-version field membership, request body limits and privacy-preserving rate limits.
- **FR-011**: Authenticated teachers MUST have `/settings/telegram` reachable from profile navigation
  with GET/PUT settings and a separate test-message action.
- **FR-012**: Telegram Bot Token MUST be encrypted at rest with a versioned application key, remain
  server-only and never be returned after write. Chat ID and enablement MUST be owner-scoped.
- **FR-013**: Saving a blank token MUST retain an existing token; token replacement MUST be explicit.
  Provider responses and validation errors MUST be sanitized.
- **FR-014**: Grading MUST succeed independently of Telegram configuration or provider availability.
  Delivery MUST occur after attempt persistence through a durable, uniquely keyed outbox record.
- **FR-015**: Telegram messages MUST be built only from the persisted server grading result, escape
  all dynamic text, include lesson title/version, student name, score and ordered per-exercise detail,
  and never include credentials or provenance.
- **FR-016**: Delivery MUST be at most once after a successful claim. An ambiguous provider outcome
  MUST be recorded for teacher diagnosis and MUST NOT be automatically resent.
- **FR-017**: Attempts and student display names MUST be retained indefinitely and remain immutable. Settings remain until the teacher replaces/disables them or the account lifecycle removes them.
- **FR-018**: Logs and telemetry MUST contain IDs, counts, latency, outcome and sanitized provider
  codes only; Bot Tokens, Chat IDs, student names, submitted answers and accepted answers MUST NOT be
  logged.
- **FR-019**: Existing published lessons and StudentLessonSpec versions MUST remain readable; grading
  adapters MUST be selected by explicit lesson/contract/grader version rather than mutable defaults.
- **FR-020**: Telegram notification settings MUST NOT be disclosed to anonymous students, and all
  teacher settings routes MUST derive ownership from the authenticated server session.
- **FR-021**: An authenticated teacher viewing a public lesson MUST have direct navigation to
  `/lessons`; anonymous visitors MUST NOT see teacher-library navigation.
- **FR-022**: The owner-scoped lesson library MUST render published lessons before editable imports
  and drafts, independent of their timestamps.
- **FR-023**: The lesson library MUST support combinable, URL-backed filtering by case-insensitive
  title substring and exact lifecycle status, including `published`, and MUST provide explicit empty
  and reset states.
- **FR-024**: The lesson library MUST request owner-scoped results in ordered pages of at most 24
  items, automatically request the next page near the scroll boundary, and retain a keyboard-
  operable `Показать ещё` fallback. Pagination MUST preserve the active title/status filters and the
  invariant that all matching published lessons precede editable imports.

### Non-Goals

- Student accounts, classroom rosters, assignments, deadlines or gradebooks.
- Teacher web history/dashboard for all attempts in this feature.
- Manual grading of open-ended essays or model-based semantic grading.
- Editing a completed attempt or changing an immutable published answer key.
- Using Telegram as an authentication mechanism or accepting commands from the bot.
- Copying v2's client-computed `score`, `ok` or `correctLine` trust boundary.

### Key Entities

- **Student Attempt**: Immutable anonymous submission bound to one public lesson version, owner,
  display name, idempotency fingerprint, grader version, score and lifecycle timestamps.
- **Attempt Response**: One submitted value and server-derived result for one response field; stores
  only the accepted display values needed for the completed-attempt result.
- **Telegram Settings**: Owner-scoped enablement, Chat ID, encrypted Bot Token envelope, key version,
  optional sanitized bot username and timestamps.
- **Telegram Delivery**: One durable outbox record per attempt with claim state, provider message ID
  when known, sanitized failure category and timestamps.
- **Grading Policy**: Versioned deterministic mapping from interaction/response kind to validation,
  normalization and comparison behavior.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of supported interaction regression cases produce the expected per-field score
  without accepting a client-provided correctness value.
- **SC-002**: In browser tests, every mixed-result submission marks all fields accessibly and places
  focus on the first incorrect field in document order; all-correct attempts focus the summary.
- **SC-003**: Pre-submit student payload and rendered HTML contain zero accepted answers or correct
  IDs in security tests; completed-attempt responses expose answers only for that attempt's incorrect
  fields.
- **SC-004**: Duplicate identical requests create exactly one attempt and at most one delivery;
  conflicting idempotency replays return `409` in 100% of resilience cases.
- **SC-005**: Cross-tenant settings and attempts are rejected in 100% of API/RLS tests, and no secret
  value appears in API responses, logs or telemetry fixtures.
- **SC-006**: Telegram disabled, invalid credential, timeout and provider 4xx/5xx cases never change a
  valid grading response into an error.
- **SC-007**: Attempt submission and synchronous grading complete within 1 second p95 for 500 fields,
  excluding asynchronous Telegram delivery, in the project performance environment.
- **SC-008**: The settings browser journey saves credentials, reloads without revealing the token,
  sends a test message and supports enable/disable without cross-tenant leakage.
- **SC-009**: In library regression tests, published cards precede editable cards in 100% of mixed
  datasets and every title/status combination returns exactly the matching owner-scoped items.
- **SC-010**: Authenticated preview tests expose one working `/lessons` navigation control while
  anonymous public lesson HTML contains no teacher-library navigation.
- **SC-011**: A library fixture with more than 48 mixed items loads in 24-item pages without
  duplicates or omissions; automatic scroll loading and the manual fallback produce the same order,
  with published matches preceding editable matches.

## Assumptions and Dependencies

- Feature 001's anonymous public lesson ID and immutable lesson versions remain the access boundary.
- Feature 002 may add `matching`; this feature defines a grader registry so matching can add an
  adapter without changing the attempt protocol.
- Supabase remains the durable store, Inngest remains the background dispatcher, and Telegram Bot
  API is the only notification provider in this feature.
- Production must provide `TELEGRAM_CREDENTIALS_ENCRYPTION_KEY` and a documented rotation procedure
  before Telegram settings can be enabled.
