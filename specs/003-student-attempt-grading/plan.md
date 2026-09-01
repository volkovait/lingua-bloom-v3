# Implementation Plan: Student Attempt Grading and Telegram Results

**Branch**: `003-student-attempt-grading` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Status**: In progress — product defaults confirmed on 2026-09-01

## Summary

Add a versioned deterministic grading boundary to anonymous public lessons. The browser submits only
student identity and field values; the server resolves the immutable published `LessonSpec`, grades
through interaction-specific adapters, persists one idempotent attempt and returns a student-safe
result. A separate owner-authenticated settings page stores encrypted Telegram credentials. Attempt
persistence creates a durable notification outbox entry, but Telegram availability never affects the
student's grading response.

The v2 Telegram settings UX is a visual/product reference only. Its client-computed score and result
rows are explicitly rejected because they permit forged teacher notifications.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 22+

**Primary Dependencies**: Next.js 16, React 19, Zod 4, Supabase JS 2.57, Inngest 3.44, Node WebCrypto

**Storage**: Supabase PostgreSQL for attempts, response results, encrypted settings and notification
outbox

**Testing**: Vitest unit/contract/integration/security/resilience/performance suites; Playwright for
anonymous student and authenticated teacher journeys

**Target Platform**: Vercel server runtime and evergreen desktop/mobile browsers

**Performance Goals**: deterministic grading and persistence within 1 second p95 for 500 fields;
Telegram delivery asynchronous and outside the response latency budget

**Constraints**: anonymous public lessons; no answer leakage before completion; no model calls in
grading; maximum 500 fields; Telegram message limit and untrusted dynamic text; secrets server-only

**Scale/Scope**: one immutable attempt per submit action, one owner settings row, one delivery row per
attempt, current LessonSpec 1.0/1.1 plus an extensible adapter boundary for 1.2 matching

## Constitution Check

*GATE: Passes for the proposed design; re-check after contract design and before implementation.*

| Principle | Design evidence | Gate |
|---|---|---|
| I. Source Fidelity and Provenance | Grading reads only teacher-verified immutable AnswerSpec values from the exact published version | PASS |
| II. Versioned Specifications Are Canonical | Attempt/result/grader contracts are versioned and bind to a LessonSpec version; old student specs remain readable | PASS |
| III. Deterministic Core, Bounded AI | No model participates in grading, scoring, persistence or notification composition | PASS |
| IV. Evaluation Before Release | Grader fixtures, answer-leakage, idempotency, RLS, provider-failure and browser focus tests precede release | PASS |
| V. Secure, Durable, Observable Execution | Tokens are encrypted, attempts/outbox are durable, ownership is server-derived and logs are redacted | PASS |

Product constraints pass with the confirmed identity, answer-reveal and indefinite-retention decisions in the spec.

## Architecture and Flow

```text
Anonymous lesson page (StudentLessonSpec, no keys)
  -> POST version + displayName + field responses + idempotencyKey
  -> strict request validation and rate limit
  -> resolve lesson by public ID and exact immutable version
  -> versioned deterministic grader registry
  -> atomic persist attempt + field results + delivery outbox
  -> return completed-attempt result
       -> UI summary + accessible field states + focus/scroll first error
  -> dispatch outbox independently
       -> resolve/decrypt owner Telegram settings
       -> escape server-derived result and send at most once
```

### Attempt state transitions

```text
new request -> completed
duplicate identical request -> completed (stored replay)
conflicting idempotency request -> rejected
invalid/unknown version -> rejected
```

Grading and persistence are one short request transaction. There is no long-running attempt state and
no model call. A completed attempt is immutable.

### Delivery state transitions

```text
pending -> skipped (disabled/unconfigured)
pending -> sending -> sent
pending -> sending -> failed
```

The claim is unique by attempt. After an ambiguous network outcome, delivery becomes `failed` and is
not automatically resent. This chooses duplicate prevention over guaranteed notification; the
attempt itself remains durable.

## Data, Migration and Compatibility

- Migration `0017_student_attempt_grading.sql` creates `student_attempts`,
  `student_attempt_responses`, `teacher_telegram_settings` and `telegram_delivery_outbox`.
- Attempts reference immutable `lesson_versions`, `lessons` and owner. The server stores a request
  fingerprint and unique `(lesson_id, idempotency_key)` for deterministic replay.
- Attempt and response rows are append-only and retained indefinitely. No cleanup or deletion endpoint is introduced by this feature.
- Telegram settings use an encrypted envelope: ciphertext, IV/nonce, authentication tag and
  `encryption_key_version`. Plain Bot Token never enters a JSON database payload.
- Settings are owner-scoped. Browser clients cannot select ciphertext columns; authenticated routes
  return a typed safe view only after `requireTeacher()`.
- The public route uses the admin client only after validating public ID/version and derives
  `owner_id` from the lesson relation; callers cannot provide an owner ID.
- New grading contracts use schema version `1.0.0` independently of LessonSpec versions. A grader
  registry chooses policy by `graderVersion` and interaction kind.
- Existing lesson rows and published specs are not rewritten.

## Grading Rules

- The server enumerates the expected response fields from the selected immutable LessonSpec and
  rejects unknown/duplicate fields. Missing expected fields become blank incorrect results.
- `singleChoice`/`oddOneOut`: submitted stable option ID must belong to the exercise and match one
  verified accepted value through an explicit option-ID resolver.
- `bracketGap`/`inlineGap`/`wordBankGap`: use the versioned subject text-answer normalizer and compare
  against every verified accepted value.
- `wordOrder`: validate ordered tokens or canonical serialized value using a dedicated policy; do
  not silently apply the English text adapter.
- Future `matching`: compare stable matching-bank entry IDs and enforce its `useOnce` invariant in a
  dedicated adapter introduced with LessonSpec 1.2.
- One answer field equals one point. Exercise state is correct when all fields pass, incorrect when
  none pass, and partial otherwise.

## API and UI Contract

- `POST /api/lessons/{publicLessonId}/attempts` accepts no correctness or score fields. It returns the
  immutable attempt result and safe reveal data for incorrect fields only.
- `GET /api/settings/telegram` returns `enabled`, `chatId`, `tokenConfigured`, optional `botUsername`
  and timestamps; never token material.
- `PUT /api/settings/telegram` validates enablement, Chat ID and optional replacement token. Omitting
  token retains the existing encrypted value.
- `POST /api/settings/telegram/test` claims a bounded test send with sanitized response mapping and
  per-owner rate limiting.
- `/settings/telegram` is linked from the existing authenticated profile dropdown and follows the
  v2 information architecture while using the v3 design system and session boundary.
- `LessonRenderer` becomes an attempt form with required identity, submitting/graded states,
  field-level status components and a result summary. The first incorrect control receives focus and
  `scrollIntoView`; reduced motion uses immediate scrolling.
- The UI never computes the authoritative score. Client-side state maps only the server response to
  presentation.

## Security and Privacy

- Bot Token uses AES-256-GCM via Node WebCrypto with a production secret not stored in Supabase.
- Key rotation decrypts by stored key version and re-encrypts on the next successful settings write;
  an operational migration command handles forced rotation.
- Dynamic Telegram strings are HTML escaped and messages are split only on safe boundaries under the
  provider limit.
- The public attempt request has a strict JSON content type, body-size cap, 500-field cap, per-value
  cap, UUID idempotency key and privacy-preserving request throttling. Raw IP is not stored.
- Student display name and answers are personal data. They are absent from logs/events and retained indefinitely under the confirmed product policy.
- The completed-attempt response is non-cacheable (`Cache-Control: no-store`). Public lesson payload
  caching remains independent and answer-free.

## Validation and Observability

- Contract tests reject client-provided score/correctness and malformed field membership.
- Golden grader cases cover every supported interaction, multiple accepted values, locale/case
  normalization, partial exercises, blanks and version binding.
- Security tests inspect HTML, RSC/student API, attempt errors, logs and settings responses for keys,
  accepted values, credentials and cross-tenant data.
- Resilience tests cover identical replay, conflicting replay, concurrent submission, delivery claim,
  ambiguous send and provider outage.
- Browser tests cover mobile/desktop, keyboard-only use, status semantics, first-error focus/scroll,
  all-correct summary focus, retake and teacher settings reload/test-send.
- Metrics record attempt ID, lesson/version IDs, counts, duration, score aggregate and delivery
  outcome. They never record identity, answers, Chat ID or token.

## Project Structure

```text
specs/003-student-attempt-grading/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
└── contracts/openapi.yaml

packages/contracts/src/
├── student-attempt.ts
└── telegram-settings.ts
packages/domain/src/grading/
├── registry.ts
├── choice-grader.ts
├── text-grader.ts
└── word-order-grader.ts
packages/lesson-pipeline/src/
├── attempt-repository.ts
└── telegram-outbox.ts
apps/web/app/api/lessons/[publicLessonId]/attempts/route.ts
apps/web/app/api/settings/telegram/route.ts
apps/web/app/api/settings/telegram/test/route.ts
apps/web/app/settings/telegram/page.tsx
apps/web/components/lesson/lesson-renderer.tsx
apps/web/components/settings/telegram-settings-form.tsx
apps/web/src/telegram/
├── credentials.ts
├── client.ts
├── message.ts
└── dispatch.ts
supabase/migrations/0017_student_attempt_grading.sql
```

## Implementation Stops

1. After Phase 2, stop for contract/migration review before applying migration.
2. After P1, stop for the teacher to run a mixed-answer and all-correct browser test.
3. After P2, stop for the teacher to save credentials and send a test Telegram message.
4. After P3, stop for a live anonymous submission and teacher notification check.
