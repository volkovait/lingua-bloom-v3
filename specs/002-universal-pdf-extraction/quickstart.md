# Quickstart: Validate Universal PDF Extraction

## Preconditions

- Node.js 22+, pnpm 11 and project dependencies are installed.
- Local web/Inngest services and the configured Supabase project are available for live journeys.
- Source files are copied byte-for-byte to `tests/fixtures/sources/vocab.pdf` and
  `tests/fixtures/sources/placement_test.pdf`; their checksums and human labels are committed.
- No model credential is required for deterministic acceptance tests.

## 1. Contract and characterization gate

```bash
pnpm contracts:check
pnpm test -- packages/document-ingestion packages/exercise-extraction
```

Expected: 1.0/1.1 fixtures remain readable, 1.2 matching conditional invariants pass, invalid bank
references fail, and readable unknown layouts produce a typed review result rather than a raw Zod
error.

## 2. New golden fixtures

```bash
pnpm test -- packages/evals/src/fixtures/vocab-matching.eval.test.ts
pnpm test -- packages/evals/src/fixtures/placement-test.eval.test.ts
```

Expected `vocab.pdf`: exactly one matching group, five student exercises, example 0 accounted but
not student-answerable, one A–F matching bank, no local option copies, `useOnce`, complete SourceRefs.

Expected `placement_test.pdf`: exactly 50 single-choice exercises with source ordinals 21–70, four
ordered options each, Grammar/Vocabulary boundaries preserved, multi-line prompts complete, and no
page boilerplate in prompts/options. With no answer key, every answer remains unverified.

## 3. Full regression and quality gates

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:integration
pnpm test:security
pnpm test:resilience
pnpm build
```

Expected: feature 001 golden counts and SourceRefs are unchanged; no unsupported additions; tenant
isolation, idempotent review and student answer leakage tests pass; deterministic extraction stays
within the established performance gate.

## 4. Browser journey: unknown layout recovery

1. Run `pnpm dev`, sign in as a teacher and upload a readable unsupported PDF.
2. Confirm source preview and ordered unknown candidates appear without an internal error.
3. Choose a supported interaction for one candidate, edit its required fields, and assign
   `reference`, `example` and `teacher exclusion` to other candidates; reload and confirm every
   decision persists beside the same source evidence.
4. Confirm dispatch remains blocked for invalid structural fields and resumes only with at least one
   valid group and complete candidate accounting.
5. Open the same run as another tenant and confirm the response is indistinguishable from not found.
6. Submit from two tabs: the stale revision must receive `409` and must not overwrite the first edit.

## 5. Browser journey: placement test

1. Upload `placement_test.pdf` through `/imports/new`.
2. Confirm the review page contains Grammar and Vocabulary, questions 21–70 and four options each.
3. Confirm repeated headers/footers are absent and the PDF remains visible beside the result.
4. Confirm publication stays blocked until all correct answers are teacher supplied and verified.

## 6. Browser journey: matching

1. Upload `vocab.pdf` and confirm the A–F bank appears once above five exercises.
2. Confirm item 0 is shown only as source/example context and is not answerable.
3. Supply and verify correct bank-entry IDs, save, reload and publish.
4. Open the public link anonymously; assign an entry and confirm it cannot be reused in that attempt.
5. Inspect the student response and confirm accepted IDs/answer provenance are absent.

## 7. Live release evidence

Record fixture checksums, commands, timings, counts, browser results, migration/RLS evidence and any
model-enrichment outcome in the validation report. Model-provider failure must be recorded as an
optional warning and must not prevent deterministic draft or fallback review creation.
