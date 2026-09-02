# Tasks: Universal Structural Extraction

**Input**: Design documents from `/specs/002-universal-pdf-extraction/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the constitution. Contract/golden/failure tests precede their implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files after its prerequisites.
- **[USn]**: Maps to the numbered user story in `spec.md`.

## Phase 0: Accepted compatibility fixes

These completed fixes remain evidence but do not satisfy the model-first feature gates.

- [x] T060 Render one-gap single-choice controls inline in teacher/student views in
  `apps/web/src/lesson/inline-choice.ts`, `apps/web/components/review/exercise-draft-editor.tsx` and
  `apps/web/components/lesson/lesson-renderer.tsx` (FR-025, SC-012)
- [x] T061 Add teacher-triggered answer suggestions with CAS persistence and manual fallback in
  `apps/web/app/api/imports/[runId]/suggest-answers/route.ts` and review UI (FR-026, SC-013)
- [x] T062 Detect PDF vector answer lines and project them as canonical `___` markers in
  `packages/document-ingestion/src/pdf-to-ir.ts` (FR-027)
- [x] T063 [P] Add the 50-prompt placement blank regression in
  `apps/web/src/imports/placement-prompt-regression.test.ts` (SC-014)
- [x] T064 Version PDF `DocumentIR` parser output and reject stale cache entries in ingestion (FR-028)
- [x] T065 [P] Add legacy/current IR cache-selection regressions in
  `apps/web/src/imports/select-ir-checkpoint.test.ts` (SC-015)

---

## Phase 1: Immutable acceptance evidence

- [x] T001 Copy `vocab.pdf` and `placement_test.pdf` byte-for-byte into
  `tests/fixtures/sources/` and record SHA-256/text-layer scope (FR-023)
- [x] T002 [P] Create human-labelled structure/SourceRef manifests in `tests/golden/` (FR-023)
- [x] T003 [P] Register fixture and parser/schema versions in `tests/fixtures/fixtures.json` and
  `tests/golden/baseline-report.json` (FR-022, FR-023)

---

## Phase 2: Foundation — common IR, limits and structural model contract

**Purpose**: Establish the only production structural-classification path before story work.

- [x] T066 [P] Add PDF-page and pasted-text Unicode-limit contract tests proving rejection before IR
  persistence/model dispatch in `apps/web/tests/api/import-limits.contract.test.ts` and
  `packages/document-ingestion/src/source-limits.test.ts` (FR-035)
- [x] T067 Implement PDF `<=5 pages` and normalized pasted-text `<=30,000 Unicode code points`
  admission plus a common immutable IR adapter boundary in `packages/document-ingestion/src/`
  and `apps/web/src/imports/` (FR-001, FR-002, FR-028, FR-034, FR-035, FR-038)
- [x] T068 [P] Add failing Zod/JSON-schema sync tests for request/proposal strictness, version pins,
  semantic roles, supported interaction kinds, answer-field descriptors, block/span-only refs and
  reconciled global output in `packages/contracts/src/structural-classification.test.ts`
  (FR-008, FR-029, FR-030, FR-032, FR-034)
- [x] T069 Implement/export `StructuralClassificationRequest`, `StructuralProposal`, extraction
  profile, model-call manifest and `ReconciledStructure` schemas in
  `packages/contracts/src/structural-classification.ts`, `packages/contracts/src/index.ts` and
  `packages/contracts/schemas/`; pin `structure-v1` to 64
  blocks/12,000 input tokens, 8-block overlap, confidence 0.80, timeout 45s, 2 attempts and
  concurrency 3 (FR-008, FR-018, FR-029, FR-032, FR-036)
- [x] T070 [P] Add failing window-plan tests for stable identity, complete membership, bounded size and
  cross-page prompt/bank/reference continuation in
  `packages/exercise-extraction/src/window-planner.test.ts` (FR-006, FR-036)
- [x] T071 Implement profile-versioned overlapping windows over ordered IR block IDs in
  `packages/exercise-extraction/src/window-planner.ts` (FR-006, FR-036)
- [x] T072 [P] Add provider adapter tests for strict structured output and timeout, retry exhaustion,
  401, 402, 429, malformed, partial, unknown-ID and embedded prompt-injection results in
  `apps/web/src/ai/structural-classifier.test.ts` (FR-029, FR-031, FR-032, FR-040)
- [x] T073 Implement the source-language-neutral structural prompt and bounded provider adapter in
  `apps/web/src/ai/structural-classifier.ts` from
  `contracts/structural-classification-prompt.md`; treat source as untrusted quoted data and prohibit
  tools, answer solving and free model-authored source text (FR-004, FR-006, FR-007, FR-008, FR-013,
  FR-018, FR-029, FR-032, FR-034, FR-040)
- [x] T074 [P] Add deterministic reconciliation/validator property tests for identical overlap
  de-duplication, compatible continuation, conflicts, invented text, dangling IDs, ownership,
  ordering, missing blocks and empty answer fields in `packages/exercise-extraction/src/`
  (FR-014, FR-016, FR-020, FR-030, FR-036, SC-018)
- [x] T075 Implement deterministic reconciliation, exact source projection, global coverage and
  structural validation in `packages/exercise-extraction/src/reconcile-structure.ts`,
  `validate-structure.ts` and `coverage-validator.ts` (FR-014, FR-016, FR-020, FR-030, FR-036)
- [x] T076 [P] Add redaction and aggregate metric tests for window/model/reconciliation manifests in
  `packages/lesson-pipeline/src/observability-repository.test.ts` (FR-024)
- [x] T077 Extend import observability with profile/schema/prompt/model versions, attempts, durations,
  provider token usage and cost or `costUnavailable`, outcomes, window/conflict/coverage counts and
  no source/answer/URL/credential content in `packages/lesson-pipeline/src/observability.ts`
  (FR-024, FR-029, FR-032, FR-039)

**Checkpoint**: Both source kinds can produce bounded strict proposals and globally validated output;
no fixture recognizer participates.

---

## Phase 2A: Atomic exercise ownership remediation

- [x] T107 [P] Add a pasted-text regression proving group instruction ends before the first
  independently answerable item and every sequential item remains a separate Exercise in
  `packages/exercise-extraction/src/bracket-gap-extractor.test.ts` (FR-041, SC-020)
- [x] T108 Add prompt v2 atomic-item guidance plus deterministic prompt/prompt and
  instruction/prompt ownership validation with versioned conflicts and `structure-v2` in
  `apps/web/src/ai/structural-classifier.ts`,
  `packages/exercise-extraction/src/reconcile-structure.ts` and structural contracts
  (FR-029, FR-030, FR-041, SC-020)
- [x] T109 Update structural contract mirrors, quickstart and regression gates for
  ReconciledStructure 1.1.0, prompt v2 and profile v2 (FR-021, FR-041, SC-020)
- [x] T110 Add the immutable ReconciledStructure 1.0 schema, 1.0→1.1 in-memory upcaster,
  compatibility/schema-sync tests and a documented no-op database migration decision because no
  1.0 artifact was ever persisted or released (FR-021)

---

## Phase 2B: Paid-model cost safety and teacher classification

- [x] T111 Add deterministic dense group-preserving batch planning, immutable preflight hashing,
  token/cost estimation, confirmation thresholds and hard budget tests in
  `apps/web/src/ai/answer-suggestion-plan.ts` (FR-042, SC-021)
- [x] T112 Add owner-scoped leased/completed answer-suggestion batch checkpoints and atomic claim/
  complete RPCs in `supabase/migrations/0019_answer_suggestion_cost_safety.sql` (FR-024, FR-042)
- [x] T113 Add GET preflight, confirmed-plan POST, budget rejection and checkpoint reuse to
  `apps/web/app/api/imports/[runId]/suggest-answers/route.ts` (FR-042, SC-021)
- [x] T114 Prevent automatic expensive suggestions during ingestion and add teacher confirmation UI
  with request/token/cost disclosure in review (FR-042, SC-021)
- [x] T115 Add API/security contract coverage for confirmation, RLS, atomic claims and zero-call
  cancellation in `apps/web/tests/api/answer-suggestion-cost-safety.contract.test.ts` (FR-042)
- [x] T116 Bind answer plan/checkpoint identity to revision, exact payload digests, model,
  prompt/input/output and pricing versions; remove cross-run uniqueness and add stale-claim tokens
  (FR-042, SC-021)
- [x] T117 Add strict runtime/OpenAPI success and error contracts plus migration/security regression
  coverage for paid-model checkpoints (FR-024, FR-042)
- [x] T118 Version unknown-layout review 1.1 with teacher-safe exercise/reference/example/
  exclusion outcomes and legacy 1.0 compatibility tests (FR-021, FR-043, SC-016, SC-022)
- [x] T119 Add checkpointed optional AI layout-classification GET preflight/confirmed POST and
  editable UI suggestions with RUB estimate/hard limit (FR-043, SC-022)
- [x] T120 Apply migration 0019 and validate RLS, concurrent claim, stale lease, completed reuse,
  zero-call cancellation and unchanged review revision on the live project
  (FR-024, FR-042, FR-043, SC-021, SC-022)

---

## Phase 3: User Story 1 — recoverable structural review (Priority: P1) MVP

**Goal**: Provider/validation ambiguity preserves IR and opens actionable teacher review without an
automatic or empty draft.

- [ ] T078 [P] [US1] Add state-machine tests proving every provider/validator failure creates a review
  containing all significant blocks and no draft, while OCR remains distinct in
  `packages/lesson-pipeline/src/structural-review.test.ts` (FR-015, FR-016, FR-031, SC-006, SC-007)
- [ ] T079 [P] [US1] Add migration/RPC tests for owner scope, review/draft exclusivity, CAS revision,
  idempotency and retained decisions in `tests/integration/structural-review-migration.test.ts`
  (FR-024, FR-031)
- [ ] T080 [US1] Add or revise the Supabase structural-review migration and owner-derived RLS/CAS RPC
  in `supabase/migrations/`; inherit `retainForProvenance`, no TTL/delete API, restrictive source
  lineage and no cascade deletion (FR-024, FR-031, FR-037, FR-039)
- [ ] T081 [US1] Implement structural-review persistence and sanitized failure mapping in
  `packages/lesson-pipeline/src/unknown-layout-review.ts` and ingestion workflow; do not dispatch an
  automatic fallback classifier (FR-015, FR-017, FR-031)
- [ ] T082 [P] [US1] Add OpenAPI/runtime response tests for mutual exclusivity of `draft` and
  `structuralReview`, strict type-specific teacher decisions, complete review regions, source
  limits and sanitized errors in
  `apps/web/tests/api/import-status.contract.test.ts` (FR-015, FR-017, FR-024, FR-035)
- [ ] T083 [US1] Update owner-scoped status and atomic review endpoints to the 0.5 OpenAPI contract in
  `apps/web/app/api/imports/[runId]/` (FR-015, FR-024, FR-031, FR-037)
- [ ] T084 [P] [US1] Add UI tests for source-adjacent issues, automatic focus/scroll to first blocker,
  confidence, supported-type editing, keyboard use and human-readable provider/validation messages
  in `apps/web/components/review/unknown-layout-review.test.tsx` (FR-017, FR-024, FR-037)
- [ ] T085 [US1] Implement the structural-review workspace and persist classify/reference/example/
  teacher-exclusion decisions with SourceRefs and teacher provenance in
  `apps/web/components/review/unknown-layout-review.tsx` and
  `apps/web/src/imports/apply-layout-review.ts` (FR-012, FR-015, FR-017, FR-020, FR-037, SC-009, SC-016)
- [ ] T086 [P] [US1] Add cross-tenant, service-role boundary, duplicate event, stale revision and retry
  tests in `tests/security/structural-review-isolation.test.ts` and
  `tests/resilience/structural-review-idempotency.test.ts` (FR-024)

**Checkpoint**: A model outage or invalid structure is recoverable entirely in teacher review.

---

## Phase 4: User Stories 2–3 — canonical assembly and supported interactions

**Goal**: Convert valid reconciled structure into complete source-faithful drafts for placement,
matching, gaps, ordering, choice and multilingual material.

- [ ] T087 [P] [US2] Add placement golden/model evals for exact groups, questions 21–70, four options,
  source ordinals, gap positions, boilerplate exclusion and full block coverage in
  `packages/evals/src/fixtures/placement-test.eval.test.ts` (FR-003, FR-005, FR-006, FR-007,
  SC-003, SC-004, SC-014, SC-018)
- [ ] T088 [P] [US3] Add matching golden/model evals for example 0, items 1–5, one A–F bank, `useOnce`,
  stable entry IDs and zero local option copies in
  `packages/evals/src/fixtures/vocab-matching.eval.test.ts` (FR-009–FR-012, SC-001, SC-002)
- [ ] T089 [P] Add multilingual PDF/pasted-text golden and live-model evals for reference blocks,
  choice, shared word bank, ordering, true/false-as-choice and character-entry gaps without
  fixture-specific code in `packages/evals/src/fixtures/multilingual-structure.eval.test.ts`
  (FR-008, FR-034, FR-038, SC-017)
- [ ] T090 [P] [US3] Add LessonSpec/ReviewDraft/StudentLessonSpec 1.2 sync, conditional-invariant,
  upcast and answer-leakage tests in `packages/contracts/src/matching-contract.test.ts` and
  `packages/contracts/src/compatibility.test.ts` (FR-009–FR-011, FR-019, FR-021, SC-010)
- [ ] T091 [US3] Complete canonical 1.2 matching/sourceOrdinal schemas, generated JSON schemas,
  upcasters and student-safe projection in `packages/contracts/src/` and
  `packages/lesson-pipeline/src/student-projection.ts` (FR-009–FR-011, FR-021)
- [ ] T092 [US2] Assemble groups, instructions, prompts, gaps, local options, shared resources,
  reference blocks and unresolved answer fields exclusively from reconciled IR spans in
  `packages/exercise-extraction/src/assemble-draft.ts` (FR-005–FR-008, FR-012, FR-019, FR-020)
- [ ] T093 Keep structural classification and answer suggestion as separate workflow steps/contracts;
  preserve `modelInferred/needsReview` and teacher confirmation behavior in ingestion/review code
  (FR-018, FR-019, FR-026, FR-032, SC-010, SC-013)
- [ ] T094 [US3] Render matching/word banks once above the group and enforce stable-ID `useOnce`
  selection in teacher/student UI and attempt grading (FR-010, FR-011, SC-002)
- [ ] T095 [P] Add authenticated upload-review-publish-anonymous-student Playwright journeys for
  placement, matching and multilingual sources in `apps/web/tests/e2e/` (FR-024, SC-009, SC-012)

**Checkpoint**: All acceptance interaction shapes assemble, render and remain publication-safe.

---

## Phase 5: User Story 4 — remove fixture routing and preserve compatibility (Priority: P4)

- [ ] T096 [P] [US4] Add a source scan test that fails on production exact-match constants or
  recognizers named after fixtures, publishers, textbooks or exercise titles in
  `packages/exercise-extraction/src/no-fixture-routing.test.ts` (FR-033)
- [ ] T097 [US4] Remove `READING_TITLE`, `CHOICE_READING_TITLE`, `GAP_HEADING`, `CHOICE_HEADING` and
  equivalent fixture/specialized routing; route PDF and text only through IR → windows → structural
  model → reconciliation → validation in `packages/exercise-extraction/src/` and ingestion
  (FR-004, FR-013, FR-033, FR-038)
- [ ] T098 [P] [US4] Pin and run all feature 001 golden outputs plus 1.0/1.1 published-reader tests;
  do not update baselines automatically in `packages/evals/src/fixtures/` and
  `packages/contracts/src/compatibility.test.ts` (FR-021, FR-022, SC-008)
- [ ] T099 [US4] Reconcile only intentional versioned baseline migrations with human review and
  document every changed fixture in `tests/golden/baseline-report.json` (FR-022)

**Checkpoint**: No production fixture recognizer remains and old lessons remain readable.

---

## Phase 6: Release validation

- [ ] T100 [P] Run mocked provider failure matrix and verify every case retains IR, emits redacted
  usage/cost telemetry and opens review with zero automatic drafts; include adversarial embedded
  instructions that cannot change schema or trigger actions (FR-024, FR-031, FR-039, FR-040,
  SC-006, SC-007, SC-019)
- [ ] T101 [P] Run performance evaluation and assert `runId <=2s p95` and complete structural path
  `<=60s p95` for every acceptance source under the pinned profile in
  `packages/evals/src/performance.eval.test.ts` (SC-011)
- [ ] T102 [P] Validate exact SourceRef projection and 100% significant-block coverage across all
  acceptance sources in `packages/evals/src/source-fidelity.eval.test.ts` (SC-005, SC-018)
- [ ] T103 Run the opt-in live provider eval for PDF and pasted text; record model/profile/prompt
  versions without changing expected manifests in `specs/002-universal-pdf-extraction/validation-report.md`
  (SC-001–SC-004, SC-017, SC-018)
- [ ] T104 Run contract, unit, golden, integration, security, resilience, typecheck, lint, format and
  production build gates from `quickstart.md` (FR-024)
- [ ] T105 Run full browser journeys for limits, provider failure/review, placement, matching,
  multilingual text, publication and anonymous student completion; record accessibility/mobile
  evidence in `validation-report.md` (SC-009, SC-010, SC-012, SC-016)
- [ ] T106 Re-run `$speckit-analyze`, resolve every CRITICAL/HIGH finding and record the release
  decision in `validation-report.md`

## Phase 7: Mixed workbook interactions

- [x] T121 Add immutable `workbook_mixed_interactions_3_pages.pdf` source and a human-labelled
  expected manifest covering 1D, 2A and Reading boundaries (FR-044–FR-048, SC-023)
- [x] T122 Extend the canonical 1.2 matching resource invariants, student-safe projection and
  server-side stable-entry grading; add contract/grader regression tests (FR-045)
- [x] T123 Render one shared matching bank with use-once disabling and render word order as
  reorderable tokens; both controls support drag/drop plus keyboard selection in student UI (FR-045)
- [ ] T124 Add source-addressed visual regions, immutable detector crops, neutral alt labels,
  owner-scoped persistence and Storage isolation for `imageChoice` and image-backed matching banks
  (FR-046, FR-049)
- [ ] T125 Add independent presentation/stimulus contracts and teacher-led listening rendering;
  reserve attached audio for a later version without accepting invented URLs (FR-044, FR-047)
- [ ] T126 Extend structural model/reconciliation/assembly and teacher review for `shortText`,
  `imageChoice`, image matching and cross-column table/dialogue boundaries (FR-044–FR-048)
- [ ] T127 Add golden/model/browser journeys through review, publication and grading for the mixed
  workbook, including publication blocking when required image assets are unresolved (SC-023)
- [ ] T128 Implement the PDF-overlay fixed-crop confirmation UI with confirm/reject only, CAS save,
  reload persistence and teacher-decision provenance; explicitly reject move/resize/create API
  fields and add keyboard/mobile accessibility and cross-tenant isolation tests (FR-049, SC-024)
- [ ] T129 Add immutable `PublishedMediaBinding`, the anonymous lesson/version/asset media endpoint,
  ETag/cache behavior and uniform not-found responses; cover cross-tenant, cross-version, path
  disclosure and direct-Storage denial in contract/security tests (FR-050, SC-025)
- [ ] T130 Add deterministic neutral image labels with zero vision calls, payload/renderer parity
  tests and an explicit image-only non-visual accessibility release gate and report (FR-051, SC-026)
- [ ] T131 Preserve explicit source labels, derive missing labels through a versioned visual-order
  adapter and keep stable option IDs across teacher reordering; add deterministic and grading
  regression tests (FR-052, SC-027)

---

## Dependencies and execution order

- Completed Phases 0–1 are evidence only.
- Phase 2 blocks every new implementation task.
- Phase 3 depends on structural contracts, provider adapter and validator failure outcomes.
- Phase 4 depends on globally valid reconciled structure and review persistence.
- Phase 5 removal of old routing occurs only after model-first golden paths pass, but no release may
  retain the old recognizers.
- Phase 6 requires all prior phases. Contract/model tests precede implementations; pinned evals
  precede live evals; live evals never rewrite baselines.

## Parallel opportunities

- T066, T068, T070, T072, T074 and T076 can establish independent failing foundation tests.
- T078, T079, T082, T084 and T086 cover distinct review boundaries after Foundation.
- T087–T090 can build independent acceptance evidence before assembly.
- T096 and T098 can run in parallel before routing removal.
- T100–T102 are independent release gates; T103–T105 follow a green deterministic suite.

## Implementation strategy

1. Freeze the strict structural contract, common IR boundary, limits and window profile.
2. Implement model calls, reconciliation and global validation with mocked failure coverage.
3. Stop for teacher validation of the recoverable structural-review journey.
4. Implement canonical assembly and stop for placement/matching/multilingual browser validation.
5. Remove fixture-specific routing and run the complete compatibility baseline.
6. Run live-provider, performance, security and browser release gates, then analyze again.
