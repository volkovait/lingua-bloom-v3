# Implementation Plan: Universal PDF Extraction

**Branch**: `002-universal-pdf-extraction` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

## Summary

Replace fixture-shaped PDF parsing with a layered, deterministic pipeline: reconstruct source lines
with geometry, detect boilerplate and layout regions, segment candidates independently of exercise
type, then classify supported interactions. Add LessonSpec 1.2.0 matching contracts and a durable
teacher-review fallback for unknown candidates. Preserve every feature 001 baseline and keep model
use optional, bounded and downstream of deterministic candidate detection.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 22+

**Primary Dependencies**: Next.js 16, React 19, Zod 4, pdfjs-dist 5.4, Supabase JS 2.57, Inngest
3.44

**Storage**: Supabase PostgreSQL for runs, IR, review state, issues and decisions; private Supabase
Storage for immutable source PDFs

**Testing**: Vitest 3.2 for unit/contract/golden/integration/security/resilience tests; Playwright
for teacher and public-student browser journeys

**Target Platform**: Node.js server runtime and evergreen desktop/mobile browsers

**Project Type**: pnpm monorepo web application with domain packages and server routes

**Performance Goals**: return `runId` within 2 seconds p95 and complete deterministic parsing of each
acceptance PDF within 60 seconds p95 in the existing evaluation environment; record per-stage
timings and add no model call to the required path

**Constraints**: digital PDFs with readable text layers; no OCR; maximum 20 pages/50 MiB; maximum
500 answer fields; zero unsupported additions; no invalid empty ReviewDraft; existing public lessons
remain readable

**Scale/Scope**: two new immutable acceptance PDFs, 50 placement-test questions, one matching group,
and all feature 001 golden fixtures; architecture must support later subject-specific classifiers

## Constitution Check

*GATE: Passed before research and re-checked after contract design.*

| Principle | Design evidence | Gate |
|---|---|---|
| I. Source Fidelity and Provenance | Reconstructed lines retain source items; every candidate has exactly one coverage outcome; examples and boilerplate remain accounted | PASS |
| II. Versioned Specifications Are Canonical | Matching is introduced only in LessonSpec/StudentLessonSpec 1.2.0 with 1.0/1.1 readers and compatibility tests | PASS |
| III. Deterministic Core, Bounded AI | Candidate detection, coverage, draft creation and fallback routing are deterministic; model may classify only already detected ambiguous candidates | PASS |
| IV. Evaluation Before Release | Two immutable human-labelled fixtures, characterization tests, full feature 001 regression, contract/security/resilience/browser gates precede release | PASS |
| V. Secure, Durable, Observable Execution | Unknown review is owner-scoped, revisioned and durable; stage outcomes/timings are recorded without source text or signed URLs in logs | PASS |

Product constraints also pass: answer provenance remains reviewable, student payload omits answers,
and teacher fallback receives keyboard-accessible recovery actions. No constitution exception or new
workflow engine is required.

## Architecture and Flow

```text
DocumentIR blocks
  -> reconstructed lines
  -> boilerplate/layout regions
  -> exercise candidates
  -> deterministic classifiers
       -> supported groups -> coverage -> ReviewDraft 1.2.0
       -> unknown candidates -> owner-scoped UnknownLayoutReview
  -> optional bounded model classification for ambiguous existing candidates only
```

The existing specialized reading/article extractors remain deterministic strategies during the
migration. A coordinator gives each source region to at most one strategy and rejects overlapping
candidate ownership. Generic segmentation does not overwrite a higher-specificity accepted result.

### State transitions

```text
processing -> awaiting_review + ReviewDraft
processing -> awaiting_review + UnknownLayoutReview
UnknownLayoutReview --classify/edit/outcome with expected revision--> processing
processing -> awaiting_review + ReviewDraft (when groups exist and coverage is complete)
```

An unknown-layout review is a run-level review artifact, not a partial LessonSpec. It cannot be
published or projected to students. Teacher decisions reuse the existing append-only decision and
validation-issue infrastructure. An exercise decision contains a supported interaction kind and
its required editable structural fields; non-student decisions use the explicit `reference`,
`example` or `teacher exclusion` outcome. Every mutation retains candidate SourceRefs and records
teacher-decision provenance.

## Data, Migration and Compatibility

- Add versioned reconstructed-line, layout-region, candidate and unknown-review contracts.
- Add `matching`, `matchingBank` and a source ordinal distinct from display ordinal to LessonSpec
  1.2.0; StudentLessonSpec receives only the fields needed for faithful rendering. Matching answers
  use bank-entry stable IDs; source labels are display/provenance metadata only.
- Keep readers/upcasters for LessonSpec 1.0.0 and 1.1.0. New writers emit 1.2.0 after this feature.
- Persist active/resolved unknown review payload and monotonic revision at the run boundary through
  one migration; RLS follows pipeline-run ownership and all teacher mutations use an atomic RPC/CAS
  check. Resolved artifacts are retained as audit evidence rather than deleted.
- Persist typed exercise edits and `reference`/`example`/`teacher exclusion` decisions atomically;
  incomplete interaction fields remain in the active review and cannot dispatch draft assembly.
- Stamp each PDF DocumentIR with the parser version. Cache lookup may reuse only an IR produced by
  the current parser version; legacy IR remains immutable provenance and is never selected for a
  new draft. A cache miss creates a current-version IR instead of choosing the oldest checkpoint.
- Do not rewrite immutable published versions or existing DocumentIR payloads.

## API and UI Contract

- `GET /api/imports/{runId}` returns exactly one of `draft`, `unknownLayoutReview`, or neither while
  processing; it never parses unknown candidates as ReviewDraft.
- `POST /api/imports/{runId}/layout-review` accepts one or more typed decisions: a supported
  interaction kind with its editable required fields, or `reference`, `example` or
  `teacher exclusion`, plus `expectedRevision` and `idempotencyKey`; stale revisions return `409`
  without partial writes.
- The review page shows the source beside ordered unknown candidates, evidence, suggested type when
  present, a supported-type selector, required-field editors and explicit non-student outcome
  controls. Invalid fields remain next to the source with actionable messages. Raw Zod/schema errors
  never reach the user.
- Single-choice prompts with one canonical `___` share one inline-select presentation rule in
  teacher preview and student rendering; option editing is collapsed by default.
- Draft review exposes teacher-triggered answer suggestions through the existing bounded Responses
  integration. Persisted suggestions remain `modelInferred` and cannot bypass confirmation gates.
- Matching renders one bank above the group in teacher and student views. `useOnce` prevents the
  same bank-entry ID from being assigned twice within an attempt.

## Validation and Observability

- Candidate coverage is calculated before draft validation. Empty groups route to typed review or
  OCR state and are never passed to `ReviewDraftSchema`.
- Layout-review dispatch validates every typed teacher decision, preserves its candidate lineage and
  resumes assembly only when at least one valid group exists and every candidate has one outcome.
- Every stage records parser/contract version, counts, duration and outcome. Logs/manifests contain
  IDs and aggregates, not source text, answers, signed URLs or credentials.
- Release requires exact fixture counts, SourceRef resolution, feature 001 golden parity, contract
  compatibility, RLS/tenant isolation, retry/idempotency, accessibility and full browser journeys.

## Project Structure

```text
apps/web/
├── app/api/imports/[runId]/layout-review/route.ts
├── components/review/unknown-layout-review.tsx
├── components/lesson/lesson-renderer.tsx
├── src/imports/apply-layout-review.ts
├── src/imports/build-review-draft.ts
└── src/imports/select-ir-checkpoint.ts
packages/
├── contracts/src/{layout-extraction,lesson-spec,review-draft,student-lesson-spec,validation}.ts
├── document-ingestion/src/{reconstructed-lines,boilerplate-detector,layout-regions}.ts
├── exercise-extraction/src/{candidate-segmenter,classifiers,extraction-coordinator}.ts
└── lesson-pipeline/src/{unknown-layout-review,student-projection}.ts
supabase/migrations/0015_unknown_layout_review.sql
tests/
├── fixtures/sources/{vocab,placement_test}.pdf
├── golden/{vocab,placement_test}.expected.json
├── integration/unknown-layout-review.test.ts
├── security/unknown-layout-review-isolation.test.ts
└── resilience/unknown-layout-review-idempotency.test.ts
```

**Structure Decision**: Extend the existing package boundaries. Geometry reconstruction belongs to
document ingestion, candidate segmentation/classification to exercise extraction, canonical schemas
to contracts, durable state transitions to lesson pipeline/Supabase, and user interaction to web.

## Complexity Tracking

No constitution violations. A new interaction contract and one run-level review artifact are the
minimum structures needed to represent matching truthfully and avoid invalid LessonSpec drafts.

## Post-Design Constitution Re-check

PASS. Contracts define versioning, lineage and student-safety; the state model defines durable CAS
review; quickstart and tasks define golden, security, resilience, observability and browser gates.
No model call owns routing, coverage, answers or publication.
