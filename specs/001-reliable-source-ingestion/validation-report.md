# Feature 001 Validation Report

**Date**: 2026-08-27
**Scope**: complete feature 001 release gate for PDF and pasted-text source kinds.

## Outcome

PASS for complete feature 001. The accepted PDF baseline remains green; pasted text now passes the
same durable review/publish lifecycle, deterministic golden, resilience, security and browser gates.
Both official OpenAI live-model fixtures pass, and fresh real text run
`6e6bf18f-9a2f-4ac7-ae2c-0ea92eb37879` was reviewed and published as version 2 with no open issues.

## Automated results

| Gate | Result |
|---|---|
| `pnpm install --lockfile-only --offline` | PASS; lockfile current, no download |
| `pnpm contracts:check` | PASS; 16 tests |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS; 191 tests, 3 opt-in tests skipped |
| Three PDF golden fixtures plus `raw.txt` | PASS; 4/4 fixtures, 6 tests |
| `pnpm test:integration` | PASS; 19 tests |
| `pnpm test:resilience` | PASS; 9 tests |
| `pnpm test:security` | PASS; 29 tests |
| `packages/evals/src/performance.eval.test.ts` | PASS; 3 tests |
| Live Responses evaluation | PASS via official OpenAI Responses API: 32/34 and reading 7/7; atomic baseline promoted |
| `pnpm lint` / `pnpm format:check` | PASS |
| `pnpm build` | PASS; production Next.js build |
| Default Playwright matrix | PASS; 60 tests, 8 opt-in tests skipped across Chromium, Firefox, WebKit and mobile |
| Isolated Chromium auth matrix | PASS; 2/2 |

## Performance and boundary evidence

The performance eval checks 1, 5 and 20 accepted pages and rejects page 21. It accepts exactly
52,428,800 bytes, 500,000 Unicode code points and 500 answer fields, then rejects each first value
above the boundary. The 25-sample admission matrix remains below the 2-second p95 objective. Five
complete parses of `1_page.pdf`, including exercise extraction, remain below the 60-second p95
objective.

## Golden and live-model evidence

- `1_page.pdf`: 5 groups, 34 answer fields, zero unsupported additions, shared group-level word bank.
- `articles_4_pages.pdf`: 11 groups, one partial group, 36 items, 369 answer fields and 6 unchanged
  reference blocks.
- `reading_text_questions_4_pages.pdf`: two exact reading blocks, two complete linked question groups
  and one excluded ambiguous field.
- `reading_text_questions_missing_passage_3_pages.pdf`: negative edge fixture; expected partial
  exercise 6 and blocking `SOURCE_TRUNCATED`, never a release golden.
- Live `gpt-5.4-mini`, prompt `answer-suggestions/1.2.0`: `1_page.pdf` returned all 34 fields,
  scored 32/34 (0.941176, threshold 0.9), and added zero exercises.
- The updated reading fixture has 7 model-eligible answers. Official OpenAI `gpt-5.4-mini` returned
  7/7, excluded the ambiguous empty-answer field and atomically promoted baseline schema 1.1.0 with
  `allFixtureGatesPassed: true`. Node uses the system CA store rather than disabling TLS validation.

Latest live reports are stored in `tests/golden/live-eval-1_page.latest.json` and
`tests/golden/live-eval-reading_text_questions_4_pages.latest.json`. Production baseline promotion is
explicit and occurs only with `UPDATE_EVAL_BASELINE=1` after a passing gate.

## Browser validation note

The fixture-mode matrix covers upload, review, shared word-bank rendering, reference/partial content,
add/delete persistence contracts, versioning, public student projection, accessibility and mobile
layout across Chromium, Firefox, WebKit and the mobile project. Authentication cannot be meaningfully
tested while fixture mode bypasses it, so `AUTH_E2E_LIVE=1 E2E_FIXTURE_MODE=0` runs the login redirect
and real sign-in tests on a separate server; both passed in Chromium. T139 additionally passed with
run `59026072-e713-4c34-b120-10aa505136af`: the live draft contained 2 complete groups, 2 reference
blocks, 8 initial exercises and no `SOURCE_TRUNCATED`; after the ambiguous item was excluded and the
remaining 7 answers verified, the run completed. Anonymous page and student API for public ID
`75nZb5vhb4kr_l_-RaH3Mg` both returned 200 with 2 groups and 2 reference blocks and no answer leakage.

### Text review live acceptance — 2026-08-26

The teacher completed the current local live review check and explicitly accepted the interaction:
answer fields remained editable, model-suggested answers could be confirmed, and the associated
`ANSWER_UNVERIFIED` red highlighting was required to disappear immediately after confirmation.
That behavior is covered by the T152 policy regression and web typecheck.

During the same acceptance cycle the teacher found that `raw.txt` item 17 had been represented with
three fields. Source reinspection established that this `bracketGap` item has exactly two target
expressions, `(to wear)` and `(to wear)`; `Yes, I ....` is dialogue context, not a third field. The
extractor, fixture manifest and golden now require 29 total answer fields, preserve all four dialogue
ellipses in prompts, and require exactly two fields for item 17 (`Do you wear` and `wore`).
Extractor tests, the raw golden evaluation and the text workflow regression pass.

This acceptance records the completed manual review-feedback cycle. It does not replace the fresh
post-fix authenticated paste → review → save/reload → publish → anonymous lesson browser journey
required by Phase 4C.

### Phase 4C automated evidence — 2026-08-26

- T145 passed in isolated Chromium: text source preview, teacher-created exercise and
  `teacherSupplied` answer, deletion, optimistic revisions, reload persistence and publish readiness.
- T056 passed in isolated Chromium with a temporary confirmed Supabase teacher: paste submission,
  authenticated progress/review/publish pages and anonymous public lesson all completed. Processing
  and persistence were controlled fixtures; the fresh real workflow remains part of T148.
- T146 passed four resilience regressions for stale dispatch, checkpoints, duplicate delivery,
  owner-only recovery and the no-automatic-model-retry policy.
- T147 passed five security regressions for input boundaries, prompt-injection inertness,
  authentication-before-work, tenant/storage isolation and student answer-leakage gates.
- The complete Phase 4C targeted run passed 12 Vitest cases, the text mutation Playwright case and
  the authenticated publish Playwright case; web TypeScript validation also passed.

### Final real text journey — 2026-08-27

The teacher accepted the complete live text journey. Supabase confirms run
`6e6bf18f-9a2f-4ac7-ae2c-0ea92eb37879` is `completed` at `publish-version`, with no open validation
issues. The corrected item 18 prompt and `teacherSupplied` answer persisted; its linked
`SOURCE_TRUNCATED` issue resolved. Lesson `58192edb-cfdc-4497-9303-180d1c7f0085` published version 2
under stable public ID `JqMuy3CMYQvH79fC10xnOg`; anonymous URL:
`/learn/JqMuy3CMYQvH79fC10xnOg`.

## Closure

T148 and T149 are complete: deterministic, contract, integration, resilience, security, performance,
live model, production build and full browser matrix gates pass. The final post-fix
`$speckit-analyze` covered 71 formal requirements and 154 uniquely identified tasks, with 100%
requirement coverage and zero CRITICAL/HIGH findings. Feature 001 is closed.
