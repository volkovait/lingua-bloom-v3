# Validation Report: Student Attempt Grading and Telegram Results

**Status**: Live golden-set API journey passed on 2026-09-01; visual browser and configured
Telegram-delivery checkpoints remain pending.

## Confirmation gate

- [x] Required student display name confirmed
- [x] Immutable attempt plus explicit retake confirmed
- [x] One point per answer field confirmed
- [x] Correct-answer reveal after submission confirmed
- [x] Optional non-blocking Telegram delivery confirmed
- [x] Indefinite attempt and student-name retention confirmed
- [x] Anonymous student and privacy-preserving rate-limit model confirmed

Implementation is authorized. Migration 0017 is applied to live Supabase. Production Telegram
credentials remain an explicit teacher-owned operational checkpoint.

## Evidence to collect after approval

- Contract and schema synchronization
- Deterministic grading matrix
- Pre-submit answer-leakage matrix
- RLS and cross-tenant isolation
- Encryption and safe settings view
- Idempotency and delivery claim resilience
- Accessibility and first-error focus/scroll browser evidence
- Live test message and anonymous attempt delivery with personal values redacted
- Performance and indefinite-retention checks
- Final `$speckit-analyze` result

## Automated implementation checkpoint — 2026-09-01

- Added versioned attempt/settings contracts and deterministic choice/text/ordered-token grader.
- Added immutable indefinite-retention migration 0017 with RLS, atomic idempotency, encrypted
  settings envelope, rate limiting and at-most-once Telegram outbox claim.
- Added anonymous attempt API, accessible correct/incorrect UI, first-error focus/scroll and
  explicit retake.
- Added authenticated Telegram settings page/API, AES-256-GCM credential handling, safe test send
  and asynchronous server-derived result delivery.
- Targeted feature suites: 14/14 tests passed.
- Full regression: 221 passed, 3 skipped; typecheck, lint, format and production build passed.

## Live golden-set checkpoint — 2026-09-01

Fixture: `tests/fixtures/sources/1_page.pdf`. Evidence contains IDs and aggregate outcomes only.

- Applied migration 0017 to Supabase project `cuuefjpbgzulpaddczkk`; verified all five feature
  tables have RLS enabled and all three service-only RPCs exist.
- Import run `df8acf14-77b4-459c-a2bf-c93814430fc6` reached `awaiting_review` with the expected
  5 groups, 34 exercises and 34 answer fields. All fields were matched to the human-labelled golden
  expectations, saved as teacher-verified answers, and the run reached `ready_to_publish` with zero
  open issues.
- Published lesson `64d586ce-4fcd-4333-954c-d9f2d6fc7392`, version 1, under public ID
  `vSlSBjW9zsFTdHDFLIWqhg`; the public page returned HTTP 200 and rendered the required student-name
  and completion controls.
- Attempt `3599c3c7-f558-4248-840e-30a117254b2d` intentionally submitted incorrect/blank values:
  server score `0/34`; all fields were incorrect and each exposed a post-submit accepted display
  value.
- Attempt `692bba52-9a2e-4aaa-aa00-6c23e5022056` used golden answers with uppercase text-entry
  variants: server score `34/34`; no accepted answers leaked for correct fields.
- Live persistence contains 2 immutable attempts and 68 immutable response rows. Inngest processed
  both unique delivery events; both outbox records reached `skipped` because the isolated test
  teacher intentionally had no Telegram credentials. Grading remained successful.
- Full gates after the live fixes: 221 tests passed, 3 explicitly skipped; production build,
  typecheck, lint and format check passed.

The in-app browser control surface was unavailable in this task session, so focus/scroll visual
behavior was not claimed from this run. Manual checkpoint A and the enabled Telegram message
checkpoint remain open.
