# Quickstart: Student Attempt Grading and Telegram Results

This runbook is intentionally non-executable until the product defaults in `spec.md` are confirmed
and the feature is implemented.

## Automated gates

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Required focused suites:

- attempt contract and exact-version grading;
- every interaction grader and multiple accepted values;
- pre-submit answer leakage and completed-attempt safe reveal;
- idempotency, concurrency and public rate limits;
- Telegram encryption, settings RLS, safe views and provider failures;
- outbox claim/duplicate prevention and log redaction;
- 500-field p95 performance and indefinite-retention/no-delete-path checks.

## Manual checkpoint A — student grading

1. Open a real public lesson in a signed-out browser.
2. Enter the confirmed student identity field and submit a mixture of correct, incorrect and blank
   answers.
3. Verify score is per answer field and every field has text/icon plus color status.
4. Verify focus and scroll land on the first incorrect field.
5. Submit an all-correct attempt and verify focus lands on the summary.
6. Publish a newer version while an older page is open; verify the old page grades against its own
   version.
7. Inspect the pre-submit page/API and confirm no accepted answer is present.

Stop and obtain teacher approval.

## Manual checkpoint B — Telegram settings

1. Sign in as the lesson owner and open `/settings/telegram` from the profile dropdown.
2. Save Bot Token and Chat ID, reload, and verify the token value is not displayed or returned.
3. Send one test message.
4. Disable notifications and verify test action/settings state are clear.
5. Sign in as a second teacher and verify no first-teacher setting is visible.

Stop and obtain teacher approval before enabling attempt notifications.

## Manual checkpoint C — end-to-end delivery

1. Re-enable valid Telegram settings.
2. Submit one anonymous mixed-result attempt.
3. Verify the student result appears even if Telegram is delayed.
4. Verify exactly one Telegram message contains lesson/version, student display name, score and
   ordered server-derived answer detail.
5. Repeat the same idempotency request and verify no duplicate message.
6. Simulate disabled/invalid/unavailable Telegram and verify student grading still succeeds.

## Release evidence

Record only IDs, versions, counts, timings and sanitized outcomes in `validation-report.md`. Do not
record Bot Token, Chat ID, student name, submitted answers or accepted answers.
