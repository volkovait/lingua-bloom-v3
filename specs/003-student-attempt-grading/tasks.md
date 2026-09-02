# Tasks: Student Attempt Grading and Telegram Results

**Status**: In progress — product defaults confirmed on 2026-09-01.

**Input**: Design documents from `/specs/003-student-attempt-grading/`

**Tests**: Required by the feature acceptance criteria and constitution. Tests precede implementation.

## Phase 1: Contract and fixture setup

- [x] T001 Confirm student identity, retake, answer reveal and indefinite retention; record the accepted decisions in the dated Clarifications section of `spec.md`
- [ ] T002 [P] Add versioned Zod/JSON Schema/OpenAPI contract tests for attempt submission/result and
  safe Telegram settings views in `packages/contracts/src/`
- [ ] T003 [P] Create human-labelled grading fixtures for every currently published interaction,
  mixed multi-field exercises, blanks and multiple accepted values in `tests/golden/attempts/`
- [x] T004 [P] Add characterization tests proving current student payload and HTML contain no answer
  keys before submission

## Phase 2: Foundation — deterministic grader, persistence and secrets

**CRITICAL**: No student or Telegram UI implementation begins until this phase passes review.

- [x] T005 Implement `StudentAttemptSubmission` and `StudentAttemptResult` 1.0 contracts in
  `packages/contracts/src/student-attempt.ts` and generated schema sync
- [x] T006 [P] Add failing deterministic grader tests for choice, text and ordered-token policies,
  version binding, unknown/duplicate fields and 500-field limits in `packages/domain/src/grading/`
- [x] T007 Implement the versioned grader registry and interaction-specific adapters without model
  calls in `packages/domain/src/grading/`
- [x] T008 [P] Add failing migration/RLS/idempotency/immutability/outbox claim tests in
  `tests/integration/student-attempt-migration.test.ts` and
  `tests/security/student-attempt-isolation.test.ts`
- [x] T009 Create migration `supabase/migrations/0017_student_attempt_grading.sql` with immutable
  attempts/responses, encrypted settings envelope columns, unique outbox, owner constraints, RLS,
  atomic submit RPC and indefinite immutable retention
- [x] T010 Implement server repositories for exact lesson-version resolution, atomic attempt replay
  and outbox claims in `packages/lesson-pipeline/src/attempt-repository.ts` and
  `packages/lesson-pipeline/src/telegram-outbox.ts`
- [x] T011 [P] Add encryption round-trip, wrong-key, nonce uniqueness and safe-view tests in
  `apps/web/src/telegram/credentials.test.ts`
- [x] T012 Implement versioned AES-GCM Telegram credential encryption and environment validation in
  `apps/web/src/telegram/credentials.ts` and `.env.example`

**Checkpoint**: Stop for contract and migration review; do not apply migration without approval.

## Phase 3: User Story 1 — student grading MVP

- [ ] T013 [P] [US1] Add attempt endpoint contract tests rejecting client score/correctness,
  answer-key leakage, malformed membership and conflicting replay in
  `apps/web/tests/api/student-attempt.contract.test.ts`
- [ ] T014 [P] [US1] Add browser/component tests for mixed results, icons/text/ARIA, first-error
  focus/scroll, reduced motion, all-correct summary focus and retake in
  `apps/web/components/lesson/lesson-renderer.test.tsx`
- [x] T015 [US1] Implement `POST /api/lessons/[publicLessonId]/attempts` with strict body limits,
  exact-version lookup, deterministic grading, atomic persistence, no-store response and sanitized
  errors
- [x] T016 [US1] Convert `LessonRenderer` into a controlled attempt form with student identity,
  submitting/completed states, server result mapping, accessible status styling and first-error
  navigation
- [ ] T017 [P] [US1] Add p95 500-field grading performance regression and public endpoint rate-limit
  tests in `packages/evals/src/attempt-performance.eval.test.ts` and `tests/security/`
- [ ] T018 [US1] Run the anonymous mixed-answer and all-correct browser journeys against a real
  published lesson and record evidence in `validation-report.md`

**Checkpoint**: Stop and ask the teacher to validate the student page before Telegram implementation.

## Phase 4: User Story 2 — teacher Telegram settings

- [x] T019 [P] [US2] Add authenticated GET/PUT/test route contracts for owner scope, safe token view,
  retain-on-omit replacement semantics and sanitized provider failures
- [x] T020 [US2] Implement owner-scoped Telegram settings repository and safe view; never serialize
  ciphertext, nonce or Chat ID into logs
- [x] T021 [US2] Implement `GET/PUT /api/settings/telegram` and
  `POST /api/settings/telegram/test` with `requireTeacher`, validation and bounded rate limits
- [ ] T022 [P] [US2] Add settings component tests for load/save/reload, password-manager-safe token
  input, enable/disable, replacement and test-send states
- [x] T023 [US2] Add `/settings/telegram`, link it from the authenticated profile dropdown and build
  the v3 settings form using v2 only as product reference
- [ ] T024 [US2] Apply migration 0017 after explicit approval, configure the production encryption
  key, and verify settings RLS and safe API responses on live Supabase

**Checkpoint**: Stop and ask the teacher to save credentials and receive one test message.

## Phase 5: User Story 3 — durable result notification

- [ ] T025 [P] [US3] Add Telegram escaping, message splitting, server-derived-content and 409/429/
  timeout/ambiguous outcome tests in `apps/web/src/telegram/`
- [ ] T026 [P] [US3] Add duplicate dispatch, atomic claim, disabled settings and provider outage
  resilience tests in `tests/resilience/telegram-delivery.test.ts`
- [x] T027 [US3] Implement escaped message composition from persisted attempt results only and a
  bounded Telegram Bot API client
- [x] T028 [US3] Implement Inngest outbox dispatch with unique claim, `sent/skipped/failed` terminal
  states and no resend after an ambiguous provider outcome
- [x] T029 [US3] Wire attempt commit to dispatch without delaying or changing the grading response;
  expose no teacher configuration details to the student
- [ ] T030 [US3] Run a live anonymous submission, verify the exact teacher notification and record
  attempt/outbox evidence without personal data in `validation-report.md`

**Checkpoint**: Stop for teacher confirmation of message content and delivery behavior.

## Phase 6: Release validation

- [ ] T031 [P] Add cross-tenant settings/attempt tests, log redaction scans, HTML/Telegram injection
  tests and pre/post-submit answer leakage matrix
- [ ] T032 [P] Add indefinite-retention and no-delete-path security tests for attempts and student names
- [ ] T033 Run unit, contract, golden, integration, security, resilience, performance, accessibility,
  typecheck, lint, format and production build gates from `quickstart.md`
- [ ] T034 Run full browser journey: teacher settings → anonymous attempt → error scroll → Telegram
  result → retake, on desktop/mobile and keyboard-only
- [ ] T035 Run `$speckit-analyze`, resolve CRITICAL/HIGH findings and obtain final release approval

## Phase 7: Teacher lesson-library navigation

- [x] T036 Add deterministic title/status library filtering with unit coverage in
  `apps/web/src/lessons/library-filter.ts`
- [x] T037 Render published lessons before editable imports and add accessible URL-backed search,
  exact status selection, empty state and reset action on `/lessons`
- [x] T038 Add authenticated-only navigation from public lesson preview to `/lessons` without
  exposing teacher navigation to anonymous students
- [x] T039 Add regression contracts for ordering, filters and preview navigation; run focused tests,
  typecheck, lint and format checks
- [x] T040 Add a typed owner-authenticated lesson-library endpoint with stable 24-item pagination,
  title/status filters and an opaque continuation cursor
- [x] T041 Replace whole-library loading with initial server page plus an infinite-scroll client
  boundary and keyboard-operable `Показать ещё` fallback
- [x] T042 Add pagination regressions for 49+ mixed items, no duplicates/omissions, filter retention,
  published-first ordering and anonymous endpoint rejection
- [x] T043 Re-run unit, API contract, accessibility, typecheck, lint, format and production build
  gates for paginated lesson-library delivery

## Dependencies and order

- Product confirmation T001 precedes every implementation task.
- Foundation blocks all user stories.
- US1 is the MVP and must pass teacher browser validation before settings work.
- US2 must pass live credential test before result delivery is enabled.
- US3 depends on persisted attempts from US1 and settings from US2.
- Release requires every story and security/indefinite-retention evidence.
