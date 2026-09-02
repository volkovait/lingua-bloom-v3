# Quickstart: Validate Universal Structural Extraction

## 1. Prerequisites

- Node.js 22+ and pnpm
- local environment configured for Supabase and the Responses-compatible provider
- immutable fixtures registered in `tests/fixtures/fixtures.json`
- structural-review migration applied for live integration/browser checks

Install dependencies and verify the repository before focused tests:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
```

## 2. Contract and admission gates

Run structural schema sync, source limits and LessonSpec compatibility tests:

```bash
pnpm --filter @lingua-bloom/contracts test -- structural-classification matching-contract compatibility schema-sync
pnpm --filter @lingua-bloom/document-ingestion test -- source-limits reconstructed-lines
pnpm --filter @lingua-bloom/lesson-pipeline test -- observability-repository
```

Expected:

- PDF page 6 and pasted-text character 30,001 are rejected before IR/model dispatch;
- PDF page 5 and text character 30,000 remain admissible;
- structural request/proposal reject unknown fields, unsupported kinds and invalid version pins;
- ReconciledStructure 1.0 upcasts to 1.1 without changing historical profile lineage;
- model/window/reconciliation manifests reject sensitive fields, mismatched lineage and altered
  aggregate metrics;
- old LessonSpec 1.0/1.1 readers remain green and new 1.2 invariants are enforced.

## 3. Window, provider and deterministic validation gates

```bash
pnpm --filter @lingua-bloom/exercise-extraction test -- window-planner reconcile-structure validate-structure
pnpm --filter web test -- structural-classifier structural-review
```

Expected:

- every significant block belongs to a stable bounded window;
- cross-page prompts/shared banks survive overlap reconciliation;
- invented text, dangling IDs, missing blocks, conflicts and empty answer fields are rejected;
- overlapping exercise prompts and instruction spans that contain student items create blocking
  `NON_ATOMIC_EXERCISE` / `MIXED_INSTRUCTION_AND_ITEMS` conflicts;
- timeout, 401, 402, 429, malformed and partial output preserve IR and create structural review;
- no provider failure creates an automatic draft or invokes fixture-specific fallback.
- embedded source instructions cannot change the schema, call tools or trigger persistence/publication.

## 4. Answer-suggestion cost safety

Apply migration `0019_answer_suggestion_cost_safety.sql` before testing the live review UI. Then run:

```bash
pnpm exec vitest run --config vitest.workspace.ts \
  apps/web/src/ai/answer-suggestion-plan.test.ts \
  apps/web/src/ai/openai-answer-suggester.test.ts \
  apps/web/tests/api/answer-suggestion-cost-safety.contract.test.ts
```

Validate the applied migration against the linked Supabase project without provider calls:

```bash
pnpm --filter @lingua-bloom/web exec node scripts/verify-live-cost-safety.mjs
```

Expected:

- GET preflight causes zero provider calls;
- groups are densely packed without exceeding 64 answer fields per request;
- plans above 64 fields, two batches or USD 1 require exact plan-hash confirmation;
- plans above the configured hard limit cause zero provider calls;
- completed owner-scoped batches are reused after retry;
- automatic ingestion performs zero paid answer-suggestion calls;
- plan hashes change with draft payload/revision, prompt/schema/model or pricing policy;
- cancellation causes zero provider calls.

For unknown-layout review, verify that the teacher can choose six supported exercise kinds,
`reference`, `example` or exclusion. `GET /layout-review/suggest` must show one-request token/cost
estimate in RUB; cancelling makes zero calls, POST requires the exact plan hash, returns editable
suggestions without changing review revision and reuses the completed checkpoint.

## 5. Golden and model evals

Run pinned deterministic assertions first:

```bash
pnpm --filter @lingua-bloom/evals test
```

Expected:

- `placement_test.pdf`: 50 items, ordinals 21–70, four options and correct gap projection;
- `vocab.pdf`: one matching group, five student items, one A–F bank and example 0;
- multilingual PDF/text: reference material, choices, shared bank, ordering and entry gaps are
  classified without title-specific code;
- all feature 001 fixtures retain version-pinned compatibility;
- 100% significant blocks have a coverage outcome and all canonical text resolves to IR spans.
- atomicity fixtures have one Exercise per independently answerable item, zero prompt-span overlap
  and zero exercise-item spans inside group instructions.

Then run the opt-in live-provider eval with explicitly configured credentials:

```bash
RUN_LIVE_OPENAI=1 pnpm --filter @lingua-bloom/evals test -- multilingual-structure placement-test vocab-matching
```

Record provider/model/profile/prompt versions and results in `validation-report.md`. Never update a
golden manifest automatically from live output.

## 5. Integration, security and resilience

```bash
pnpm test:integration
pnpm test:security
pnpm test:resilience
```

Expected:

- structural review is owner-scoped and mutually exclusive with an automatic draft;
- teacher decisions use CAS revision and idempotency and survive reload;
- stale/duplicate dispatch cannot create duplicate drafts or decisions;
- logs contain versions, counts, timings and outcomes but no source text, answers, URLs or secrets.
- each model call records provider usage and cost or explicit `costUnavailable`; new derived artifacts
  retain `retainForProvenance` with no TTL/delete path.

## 6. Browser journeys

Start the app and worker using the repository scripts, then run Playwright:

```bash
pnpm dev
pnpm --filter web test:e2e
```

Validate these journeys:

1. A six-page PDF and 30,001-character text show readable limit errors without model activity.
2. Provider failure opens source-adjacent structural review and focuses the first blocking issue.
3. Teacher resolves unknown/reference/example/exclusion decisions; reload preserves them.
4. Placement, matching and multilingual sources reach editable drafts with no empty answer fields.
5. Answers are confirmed separately, publication succeeds and anonymous student rendering/grading
   contains no answer leakage.
6. Keyboard-only and narrow viewport operation remains usable.

## 7. Full release gate

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Release remains blocked until `validation-report.md` records exact counts, coverage, SourceRef
resolution, provider-failure behavior, performance p95, RLS/isolation and browser evidence, and a
final `$speckit-analyze` contains no CRITICAL or HIGH findings.
