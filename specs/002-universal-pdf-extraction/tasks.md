# Tasks: Universal PDF Extraction

**Input**: Design documents from `/specs/002-universal-pdf-extraction/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the feature acceptance criteria and constitution. Test tasks precede their
corresponding implementation tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no incomplete dependency.
- **[USn]**: Maps the task to the numbered user story in `spec.md`.

## Phase 0: Accepted compatibility hotfixes discovered during live validation

**Purpose**: Record already-delivered, independently tested fixes without treating them as
completion of Setup, Foundation or any user story. No remaining story task is unblocked by this
phase.

- [x] T060 Render one-gap single-choice controls inline in teacher/student views while keeping
  option editing collapsed in `apps/web/src/lesson/inline-choice.ts`,
  `apps/web/components/review/exercise-draft-editor.tsx` and
  `apps/web/components/lesson/lesson-renderer.tsx`
- [x] T061 Add teacher-triggered bounded answer suggestions with CAS persistence and manual fallback
  in `apps/web/app/api/imports/[runId]/suggest-answers/route.ts` and
  `apps/web/components/review/exercise-draft-editor.tsx`
- [x] T062 Detect source-drawn horizontal answer lines from PDF vector geometry and reconstruct them
  as canonical `___` markers in `packages/document-ingestion/src/pdf-to-ir.ts`
- [x] T063 [P] Add real-fixture regression proving exactly one canonical blank in all 50 placement
  prompts in `apps/web/src/imports/placement-prompt-regression.test.ts`
- [x] T064 Version PDF DocumentIR parser output and reject stale cached IRs in
  `packages/document-ingestion/src/pdf-to-ir.ts` and `apps/web/src/inngest/reliable-ingestion.ts`
- [x] T065 [P] Add cache-selection regressions for legacy/current PDF IRs in
  `apps/web/src/imports/select-ir-checkpoint.test.ts`

---

## Phase 1: Setup and immutable acceptance evidence

**Purpose**: Preserve the two defects before changing parser behavior.

- [x] T001 Copy `/Users/volkovaaaa/Downloads/vocab.pdf` and `/Users/volkovaaaa/Downloads/placement_test.pdf` byte-for-byte to `tests/fixtures/sources/vocab.pdf` and `tests/fixtures/sources/placement_test.pdf`, then record SHA-256 checksums and readable-text-layer scope in `tests/fixtures/README.md`
- [x] T002 [P] Create human-labelled candidate/region/SourceRef manifests in `tests/golden/vocab.expected.json` and `tests/golden/placement_test.expected.json`
- [x] T003 [P] Register both immutable fixtures, parser/schema versions and expected evaluation suites in `tests/fixtures/fixtures.json` and `tests/golden/baseline-report.json`

---

## Phase 2: Foundational contracts, layout IR and durable state

**Purpose**: Shared prerequisites for every user story.

**CRITICAL**: No remaining generic coordinator, unknown-layout editor or matching implementation
begins until the versioned contracts and persistence boundary are in place. Phase 0 hotfixes are prerequisite evidence from prior compatibility work and do not satisfy this gate.

- [ ] T004 [P] Add failing Zod/JSON-schema sync and compatibility tests for reconstructed lines, layout regions, common 1.2 exercise `sourceOrdinal`, candidates and `UNSUPPORTED_LAYOUT` in `packages/contracts/src/layout-extraction.test.ts`, `packages/contracts/src/compatibility.test.ts` and `packages/contracts/src/schema-sync.test.ts`
- [ ] T005 Implement versioned reconstructed-line, layout-region, exercise-candidate and unknown-review schemas plus common LessonSpec/ReviewDraft/StudentLessonSpec 1.2 `sourceOrdinal` scaffolding without switching production writers in `packages/contracts/src/layout-extraction.ts`, `packages/contracts/src/lesson-spec.ts`, `packages/contracts/src/review-draft.ts`, `packages/contracts/src/student-lesson-spec.ts`, `packages/contracts/src/validation.ts`, `packages/contracts/src/index.ts` and `packages/contracts/schemas/`
- [ ] T006 [P] Add failing geometry/reading-order/lineage tests for multi-item and multi-line reconstruction in `packages/document-ingestion/src/reconstructed-lines.test.ts`
- [ ] T007 Implement deterministic line reconstruction with stable SourceRefs and style/geometry evidence in `packages/document-ingestion/src/reconstructed-lines.ts` and export it from `packages/document-ingestion/src/index.ts`
- [ ] T008 [P] Add failing repeated/variable page-header and footer characterization tests in `packages/document-ingestion/src/boilerplate-detector.test.ts`
- [ ] T009 Implement conservative repeated-geometry boilerplate detection and layout-region projection in `packages/document-ingestion/src/boilerplate-detector.ts` and `packages/document-ingestion/src/layout-regions.ts`
- [ ] T010 [P] Add migration/RPC characterization tests for owner scope, artifact exclusivity, revision conflict and idempotent replay in `tests/integration/unknown-layout-review-migration.test.ts`
- [ ] T011 Add retained active/resolved `unknown_layout_reviews`, owner-derived RLS, CAS/idempotency RPC and restrictive provenance foreign keys in `supabase/migrations/0015_unknown_layout_review.sql`
- [ ] T012 Implement typed unknown-review persistence and redacted repository errors in `packages/lesson-pipeline/src/unknown-layout-review.ts` and export it from `packages/lesson-pipeline/src/index.ts`
- [ ] T013 Extend pipeline manifests with parser/contract versions, per-stage durations and aggregate layout counts while excluding source text/answers/URLs in `packages/lesson-pipeline/src/observability.ts` and `packages/lesson-pipeline/src/observability-repository.ts`

**Checkpoint**: Versioned layout artifacts and owner-scoped fallback state are ready.

---

## Phase 3: User Story 1 — understandable unknown-layout recovery (Priority: P1) MVP

**Goal**: Every readable PDF with detected candidates reaches a valid draft or durable teacher
review without leaking a raw schema error.

**Independent Test**: Import a readable unsupported PDF; classify candidates into supported
interactions and edit required fields or assign `reference`, `example` and `teacher exclusion`;
reload, exercise stale-revision and cross-tenant paths, and never observe an invalid `groups=[]`
draft.

### Tests for User Story 1

- [ ] T014 [P] [US1] Add failing characterization tests for readable empty-group, mixed known/unknown, example-only and preserved `OCR_REQUIRED` outcomes in `packages/exercise-extraction/src/unknown-layout-fallback.test.ts`
- [ ] T015 [P] [US1] Add failing status and layout-review request/response contract tests, including draft/fallback exclusivity and sanitized errors, in `apps/web/tests/api/unknown-layout-review.contract.test.ts` and `apps/web/tests/api/import-status.contract.test.ts`
- [ ] T016 [P] [US1] Add failing end-to-end persistence tests for supported-kind structural edits and `reference`/`example`/`teacher exclusion` decisions, reload persistence, complete coverage and valid-draft gating in `tests/integration/unknown-layout-review.test.ts`
- [ ] T017 [P] [US1] Add failing cross-tenant/RLS/service-role route tests in `tests/security/unknown-layout-review-isolation.test.ts`
- [ ] T018 [P] [US1] Add failing duplicate-event, idempotent replay and stale-revision tests in `tests/resilience/unknown-layout-review-idempotency.test.ts`

### Implementation for User Story 1

- [ ] T019 [US1] Implement candidate-first arbitrary-number/multi-line segmentation with exclusive line ownership in `packages/exercise-extraction/src/candidate-segmenter.ts`
- [ ] T020 [US1] Implement deterministic classifier interfaces and explicit `unknown` result evidence in `packages/exercise-extraction/src/classifiers.ts`
- [ ] T021 [US1] Replace ordinal-based routing with a strategy coordinator that protects specialized extractors and rejects overlapping region claims in `packages/exercise-extraction/src/extraction-coordinator.ts` and `packages/exercise-extraction/src/pdf-extractors.ts`
- [ ] T022 [US1] Account every candidate as exercise, example/reference, issue or teacher decision before draft validation in `packages/exercise-extraction/src/coverage-validator.ts` and `packages/exercise-extraction/src/assemble-draft.ts`
- [ ] T023 [US1] Route zero-valid-group results to typed unknown review or existing OCR state instead of `ReviewDraftSchema.parse` in `apps/web/src/imports/build-review-draft.ts` and `apps/web/src/inngest/reliable-ingestion.ts`
- [ ] T024 [US1] Return `unknownLayoutReview` from owner-scoped status and implement atomic typed submissions for supported interaction fields and all non-student outcomes in `apps/web/app/api/imports/[runId]/route.ts` and `apps/web/app/api/imports/[runId]/layout-review/route.ts`
- [ ] T025 [P] [US1] Add component tests for source-adjacent unknown candidates, keyboard controls, supported-type field editing, `reference`/`example`/`teacher exclusion` validation and human-readable errors in `apps/web/components/review/unknown-layout-review.test.tsx`
- [ ] T026 [US1] Implement the accessible unknown-layout editor with supported-type selector, required-field editors and explicit non-student outcomes, then wire it into the existing polling/review workspace in `apps/web/components/review/unknown-layout-review.tsx` and `apps/web/components/review/review-workspace.tsx`
- [ ] T027 [US1] Validate and apply typed teacher decisions with preserved SourceRefs/provenance, dispatch only after complete decisions and preserve ordered sanitized run events in `apps/web/src/imports/apply-layout-review.ts`, `apps/web/src/inngest/events.ts` and `apps/web/src/inngest/reliable-ingestion.ts`

**Checkpoint**: P1 fallback journey is independently usable without model availability.

---

## Phase 4: User Story 2 — five-page placement test (Priority: P2)

**Goal**: Reproduce Grammar/Vocabulary questions 21–70 with four ordered a–d options and no
boilerplate.

**Independent Test**: `placement_test.pdf` yields exactly 50 source-numbered single-choice exercises,
four options each and unverified answers.

### Tests for User Story 2

- [ ] T028 [P] [US2] Add failing golden evaluation for exact counts, ordinals 21–70, section boundaries, prompt completeness, option SourceRefs and boilerplate absence in `packages/evals/src/fixtures/placement-test.eval.test.ts`
- [ ] T029 [P] [US2] Add failing parser cases for arbitrary starts, numbering restarts, multi-block prompts, multi-line options and page continuation in `packages/exercise-extraction/src/single-choice-classifier.test.ts`
- [ ] T030 [P] [US2] Add failing no-answer-key publication-gate test for all 50 fields in `packages/lesson-pipeline/src/placement-publish-readiness.test.ts`

### Implementation for User Story 2

- [ ] T031 [US2] Implement heading/instruction detection from typography, geometry and extensible lexicon rather than exact titles in `packages/exercise-extraction/src/classifiers.ts`
- [ ] T032 [US2] Implement arbitrary source ordinal and multi-line single-choice assembly with ordered a–d options in `packages/exercise-extraction/src/single-choice-classifier.ts`
- [ ] T033 [US2] Preserve Grammar/Vocabulary grouping, source ordinal separate from UI ordinal and option-level lineage in `packages/exercise-extraction/src/assemble-draft.ts` and `packages/contracts/src/review-draft.ts`
- [ ] T034 [US2] Keep every missing-key answer empty/`needsReview` and expose teacher confirmation without model dependency in `apps/web/src/imports/build-review-draft.ts` and `apps/web/components/review/exercise-draft-editor.tsx`
- [ ] T035 [US2] Add the authenticated upload-to-review Playwright journey and exact visible 21–70 assertions in `apps/web/tests/e2e/placement-test-import.spec.ts`

**Checkpoint**: Placement test imports completely and publication remains safely blocked for review.

---

## Phase 5: User Story 3 — matching with one shared bank (Priority: P3)

**Goal**: Reproduce item 0 as an example and items 1–5 as matching exercises sharing one A–F
`useOnce` bank.

**Independent Test**: `vocab.pdf` yields one bank rendered once, five answerable items, no local
option copies and stable-ID answers.

### Tests for User Story 3

- [ ] T036 [P] [US3] Add failing LessonSpec/ReviewDraft/StudentLessonSpec 1.2 compatibility and conditional-invariant tests in `packages/contracts/src/matching-contract.test.ts` and `packages/contracts/src/compatibility.test.ts`
- [ ] T037 [P] [US3] Add failing golden evaluation for one group, example 0, five items, A–F bank, stable IDs, source labels and `useOnce` in `packages/evals/src/fixtures/vocab-matching.eval.test.ts`
- [ ] T038 [P] [US3] Add failing student answer-leakage and duplicate-bank-assignment tests in `tests/security/matching-answer-leakage.test.ts` and `packages/domain/src/matching-attempt.test.ts`

### Implementation for User Story 3

- [ ] T039 [US3] Complete LessonSpec/ReviewDraft/StudentLessonSpec 1.2 with `matching`, `matchingBank`, conditional invariants, upcasters and generated JSON schemas, then switch new writers to 1.2 in `packages/contracts/src/lesson-spec.ts`, `packages/contracts/src/review-draft.ts`, `packages/contracts/src/student-lesson-spec.ts` and `packages/contracts/schemas/`
- [ ] T040 [US3] Detect Match instruction, numbered left side, lettered shared bank and non-student example 0 in `packages/exercise-extraction/src/matching-classifier.ts`
- [ ] T041 [US3] Assemble canonical stable-entry-ID answers and validate same-group bank resolution without local options in `packages/exercise-extraction/src/assemble-draft.ts` and `packages/lesson-pipeline/src/publish-version.ts`
- [ ] T042 [US3] Project matching to student-safe 1.2 without accepted IDs/provenance in `packages/lesson-pipeline/src/student-projection.ts`
- [ ] T043 [US3] Render one shared matching bank above the group in teacher and student views in `apps/web/components/review/exercise-draft-editor.tsx` and `apps/web/components/lesson/lesson-renderer.tsx`
- [ ] T044 [US3] Enforce canonical stable-ID selection and `useOnce` assignment behavior in `packages/domain/src/matching-attempt.ts` and the student interaction UI in `apps/web/components/lesson/lesson-renderer.tsx`
- [ ] T045 [US3] Add upload-review-publish-anonymous-student Playwright coverage in `apps/web/tests/e2e/vocab-matching-import.spec.ts`

**Checkpoint**: Matching is contract-valid, publishable after teacher verification and student-safe.

---

## Phase 6: User Story 4 — preserve feature 001 behavior (Priority: P4)

**Goal**: Introduce generic parsing and 1.2 contracts without changing accepted existing lessons.

**Independent Test**: Every feature 001 fixture preserves expected structure, lineage and public
rendering; old published versions remain readable.

### Tests and integration for User Story 4

- [ ] T046 [P] [US4] Pin pre-feature extraction outputs and assert zero new/duplicate region claims for every existing PDF in `packages/evals/src/fixtures/feature-001-regression.eval.test.ts`
- [ ] T047 [P] [US4] Add property tests for exclusive source-region ownership and stable candidate IDs across repeated runs in `packages/exercise-extraction/src/extraction-coordinator.property.test.ts`
- [ ] T048 [P] [US4] Add 1.0/1.1 persisted LessonSpec reader and immutable-version migration tests in `packages/contracts/src/compatibility.test.ts` and `tests/integration/publish-version.test.ts`
- [ ] T049 [US4] Route all specialized and generic extractors through the coordinator while preserving version-pinned precedence in `packages/exercise-extraction/src/pdf-extractors.ts`
- [ ] T050 [US4] Run and reconcile the full golden baseline without silently updating expected manifests in `packages/evals/src/fixtures/` and `tests/golden/baseline-report.json`

**Checkpoint**: Feature 001 baseline remains unchanged and backward-compatible.

---

## Phase 7: Release validation and cross-cutting gates

**Purpose**: Close resilience, security, performance, accessibility and live evidence requirements.

- [ ] T051 [P] Add bounded ambiguous-candidate model tests proving timeout, 401/402, invalid or partial output falls back to teacher review without changing coverage in `apps/web/src/ai/openai-layout-classifier.test.ts`
- [ ] T052 Implement optional typed ambiguous-candidate suggestions with explicit evidence/retry/stop limits in `apps/web/src/ai/openai-layout-classifier.ts` and record provider outcome in `apps/web/src/inngest/reliable-ingestion.ts`
- [ ] T053 [P] Extend performance evaluation with reconstruction, segmentation and classification timings and assert import admission at most 2 seconds p95 plus each acceptance PDF deterministic parse below 60 seconds p95 in `packages/evals/src/performance.eval.test.ts`
- [ ] T054 [P] Add observability privacy tests for aggregate-only events/manifests in `packages/lesson-pipeline/src/observability-repository.test.ts`
- [ ] T055 Run complete contract, unit, golden, integration, security, resilience, typecheck, lint, format and production-build gates from `specs/002-universal-pdf-extraction/quickstart.md`
- [ ] T056 Run authenticated browser journeys for unknown fallback, placement and matching plus anonymous student rendering and keyboard/mobile accessibility in `apps/web/tests/e2e/`
- [ ] T057 Apply migration `0015_unknown_layout_review.sql` to the live Supabase project and record RPC/RLS/Storage isolation evidence in `specs/002-universal-pdf-extraction/validation-report.md`
- [ ] T058 Record fixture checksums, exact counts, SourceRef coverage, timings, provider-failure behavior and all browser results in `specs/002-universal-pdf-extraction/validation-report.md`
- [ ] T059 Re-run `$speckit-analyze`, resolve all CRITICAL/HIGH findings and record the final release decision in `specs/002-universal-pdf-extraction/validation-report.md`

---

## Dependencies and execution order

- Phase 0 contains only accepted compatibility hotfixes with dedicated regressions; it does not
  unblock or complete any user story.
- Phase 1 freezes human-labelled manifests before remaining generic coordinator/classifier work.
- Phase 2 blocks every user story.
- US1 is the MVP safety boundary and precedes live imports of US2/US3.
- US2 and US3 may proceed independently after Phase 2 and the US1 fallback boundary.
- US4 runs after coordinator integration from US1 and before release.
- Phase 7 requires all selected user stories and US4.
- Within each story, failing tests precede implementation; contracts/models precede services/routes;
  deterministic assembly precedes model enrichment.

## Parallel opportunities

- T002 and T003 can run after T001 without touching the same files.
- T004/T006/T008/T010 can establish independent foundational failing tests in parallel.
- US1 contract, integration, security and resilience tests T014–T018 are independent.
- US2 tests T028–T030 and US3 tests T036–T038 can run in parallel after Foundation.
- US4 regression, property and compatibility tests T046–T048 are independent.
- Performance, privacy and model-failure tests T051/T053/T054 are independent after story code.

## Implementation strategy

1. Treat Phase 0 as accepted prerequisite evidence, not a completed story.
2. Complete Setup and Foundation.
3. Deliver US1 as the safety MVP and stop for teacher browser validation.
4. Deliver US2, stop for `placement_test.pdf` validation.
5. Deliver US3, stop for `vocab.pdf` review/publish/student validation.
6. Run US4 regression and release gates without auto-updating baselines.

The user validates each browser checkpoint before the next story proceeds.
