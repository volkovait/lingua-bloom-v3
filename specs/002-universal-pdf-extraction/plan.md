# Implementation Plan: Universal Structural Extraction

**Branch**: `002-universal-pdf-extraction` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

## Summary

Replace fixture-specific exercise recognizers with one source-agnostic pipeline for PDF and pasted
text. Each source adapter produces immutable canonical `DocumentIR`; a required, bounded model call
proposes semantic regions, exercise boundaries, gaps, options, shared banks and relations using only
existing block/span IDs. Deterministic reconciliation, schema validation, source projection and
coverage gates decide whether a draft can be assembled. Provider or validation failures preserve the
IR and open durable teacher review without creating an automatic draft.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 22+

**Primary Dependencies**: Next.js 16, React 19, Zod 4, pdfjs-dist 5.4, Supabase JS 2.57, Inngest
3.44 and the existing Responses-compatible model client

**Storage**: Supabase PostgreSQL for sources, runs, immutable IR, model-call manifests, review state,
issues and decisions; private Supabase Storage for source PDFs

**Testing**: Vitest 3.2 for unit, schema, golden, model-eval, integration, security and resilience;
Playwright for teacher and public-student journeys

**Target Platform**: Node.js server runtime and evergreen desktop/mobile browsers

**Project Type**: pnpm monorepo web application with domain packages and server routes

**Performance Goals**: return `runId` within 2 seconds p95; complete IR-to-validated-structure for
each acceptance source within 60 seconds p95 in the pinned evaluation environment; record window,
model, reconciliation and validation timings

**Constraints**: PDF with readable text layer only; no OCR; at most 5 PDF pages; pasted text at most
30,000 Unicode characters after newline normalization; maximum 500 answer fields; no invented
source text; zero unaccounted significant blocks; no invalid empty ReviewDraft

**Initial extraction profile**: `structure-v1` uses at most 64 blocks and 12,000 estimated input
tokens per window, 8-block overlap, confidence threshold `0.80`, timeout `45s`, at most 2 attempts
per window and at most 3 concurrent window calls. Any change requires a new profile version and
golden/live evaluation evidence.

**Current extraction profile**: `structure-v2` inherits the same bounded limits and pins
`structural-classifier-v2`, ReconciledStructure 1.1.0 and atomic exercise ownership. Version 1
remains historical evidence and is not silently reinterpreted.

**Scale/Scope**: both PDF and pasted-text adapters; bounded overlapping model windows; existing
feature 001 golden fixtures plus placement, matching and multilingual fixtures; later disciplines
reuse the semantic schema without title-specific code

## Constitution Check

*GATE: Passed before research and re-checked after contract design.*

| Principle | Design evidence | Gate |
|---|---|---|
| I. Source Fidelity and Provenance | Model output contains only IR IDs/spans; deterministic projection reconstructs canonical text; every significant block has one coverage outcome | PASS |
| II. Versioned Specifications Are Canonical | Structural request/output, prompt, reconciliation and LessonSpec changes are versioned; old published readers remain supported | PASS |
| III. Deterministic Core, Bounded AI | AI proposes structure only; deterministic code owns admission, validation, coverage, persistence, review routing and publication | PASS |
| IV. Evaluation Before Release | Human-labelled PDF/text/multilingual fixtures, adversarial contract tests, live-model eval and full regression precede release | PASS |
| V. Secure, Durable, Observable Execution | Calls are owner-scoped and redacted; IR/review survives provider failure; retries and CAS are bounded and observable | PASS |
| VI. Extensible Exercise Architecture, No Format Hardcoding | Model roles map only to versioned capability schemas; fixture/title/language branches are removed; each supported kind retains renderer, grader, fallback and eval coverage | PASS |

No constitution exception is required. Structural classification is a required bounded stage, while
answer suggestion remains a separate optional stage with a distinct contract and failure path.

## Architecture and Flow

```text
PDF adapter ─────┐
                 ├─ admission limits ─> immutable DocumentIR ─> window planner
Text adapter ────┘                                      │
                                                        v
                                      strict structural model proposals
                                                        │
                                                        v
                          deterministic reconciliation + global validator
                                  │                         │
                         valid structure            invalid/low-confidence
                                  │                         │
                                  v                         v
                        canonical draft assembly    durable teacher review
                                  │
                                  v
                    teacher-triggered checkpointed answer suggestions
```

### Source admission and IR boundary

The PDF adapter reads metadata/text geometry, rejects page count above 5 before extraction/model
work and produces page-addressed blocks. The pasted-text adapter normalizes CRLF/CR to LF, counts
all Unicode code points including whitespace, rejects more than 30,000 and produces ordered blocks.
Both then expose the same immutable `DocumentIR` contract and downstream behavior.

### Windowing and reconciliation

The planner creates stable, bounded windows from ordered block IDs with an overlap sufficient to
carry headings, shared banks and exercises across a boundary. Window size and overlap are pinned in
the active versioned extraction profile and calibrated by evals rather than source language. Each request includes
document/window identity, ordered blocks, geometry/style evidence when available and neighbouring
boundary context.

The model returns a strict structural proposal: typed regions, groups, atomic exercises, gap segments,
local options, shared resources, examples, answer-key regions, boilerplate, unknowns, relations,
confidence and concise evidence. It may only reference submitted IDs/spans. Reconciliation de-dupes
identical overlap proposals, joins compatible cross-window structures and turns all conflicts into
addressable blocking issues. A global validator then checks schema, IDs, ordering, ownership,
interaction invariants, source projection, non-overlapping prompt spans, instruction/item isolation
and complete block coverage. Sentence punctuation is never used as a universal boundary: the model
proposes the smallest independently answerable item, while deterministic code verifies exclusive
source ownership.

### Failure and review transitions

```text
processing -> awaiting_review + ReviewDraft
processing -> awaiting_review + StructuralReview
processing -> blocked + SOURCE_LIMIT_EXCEEDED
StructuralReview --teacher decisions + expected revision--> processing
processing -> awaiting_review + ReviewDraft (only after global validation and coverage pass)
```

Timeout, rate limit, 401/402, invalid JSON/schema, incomplete windows or invented/dangling references
never invoke fixture or generic automatic fallback. The run retains `DocumentIR`, call manifests and
all significant blocks in a recoverable structural review. High-confidence valid structure does not
require per-element confirmation. Unknown, conflicting or below-threshold elements remain publication
blockers until a teacher decision with provenance resolves them.

## Data, Contracts and Compatibility

- Version `StructuralClassificationRequest`, `StructuralClassificationProposal`, extraction profile,
  prompt, model identity and reconciler output independently.
- Retain reconstructed blocks as the sole source of canonical prompt/option/shared-entry text.
- Persist model-call manifests and aggregate telemetry without raw source text, answers, signed URLs
  or credentials. Record provider-reported input/output token usage and cost; when the provider does
  not return cost, persist `costUnavailable=true` rather than estimating an untraceable value.
- Answer suggestions use a free deterministic preflight and configurable conservative USD-per-1K
  estimate. Plans above 64 fields, two physical batches or USD 1 require exact plan-hash confirmation;
  the default server hard ceiling is USD 10. Whole groups are first-fit packed into bounded batches.
  Owner-scoped claimed/completed checkpoints prevent concurrent or repeated payment for a completed
  batch of the same run, draft revision and plan. Automatic ingestion never calls the paid answer model. Plan identity includes draft revision, exact payload digests, model, prompt/input/output versions and pricing-policy configuration.
- Apply feature 001 `retainForProvenance` indefinitely to sources, IR, proposals, reconciled
  structures, manifests, reviews, decisions, answer-suggestion batches and layout-classification checkpoints: no TTL/delete API, restrictive source lineage and no
  cascade deletion. Legal/account deletion remains outside this feature.
- Replace the previous deterministic `LayoutRegion`/`ExerciseCandidate` origin with model-proposed
  structures plus deterministic validation status and teacher decisions.
- Keep `matching`, shared matching bank and independent source ordinal in LessonSpec 1.2.0; existing
  interaction kinds such as `wordOrder`, `singleChoice`, gap types and word-bank relations remain
  canonical rather than being invented by the classifier.
- LessonSpec 1.2.0 also separates response semantics from presentation and stimulus metadata:
  `shortText`, `imageChoice`, `matching` and `wordOrder` remain interaction kinds; table/dialogue/
  image-grid are presentation kinds; `teacherLedExternalAudio` is a stimulus kind. Word order and
  matching always use keyboard-accessible drag-and-drop.
- Extend `DocumentIR` with source-addressed visual regions and derived asset lineage. Image-based
  exercises cannot pass publication validation while any required crop/asset is missing.
- Low-confidence visual regions enter a PDF-overlay confirmation tool. Detector rectangles use
  canonical PDF-page coordinates and are immutable in review; the teacher can only confirm or reject
  each proposal. Decisions retain provenance. Rejected required media keeps the exercise unsupported
  until the whole exercise receives an explicit exclusion outcome.
- Readers/upcasters continue accepting LessonSpec 1.0.0 and 1.1.0; new writers switch versions only
  with compatibility tests. Published lessons and legacy IR remain immutable.
- ReconciledStructure readers accept immutable 1.0 and current 1.1 artifacts and upcast 1.0 to 1.1
  in memory without changing `structure-v1` lineage. New writers emit only 1.1. No 1.0 artifact was
  persisted or released, so the database migration is explicitly `not applicable`; the committed
  legacy JSON Schema and compatibility tests are the migration evidence.
- Persist structural review/revision under existing run ownership with owner-derived RLS, CAS and
  idempotency. A review and an automatic draft are mutually exclusive for the same run revision.

## API and UI Contract

- Import admission returns a localized `SOURCE_LIMIT_EXCEEDED` result containing limit type, limit
  and actual value; no model call is recorded.
- `GET /api/imports/{runId}` returns either a draft, a structural review, or neither while processing.
- Structural review submissions classify supported exercise kinds or assign `reference`, `example` or `teacher exclusion` outcomes using `expectedRevision` and an idempotency key. Optional AI suggestions use a separate checkpointed GET-preflight/confirmed-POST contract, estimate cost in RUB and never persist decisions before teacher confirmation.
- Review UI shows source beside ordered issues, confidence/evidence, proposed structure and editable
  fields. It focuses the first blocking issue and never exposes raw schema/provider payloads.
- Visual review overlays fixed detector crop rectangles on the same PDF page. Confirmation/rejection
  uses revision-aware CAS, and reload restores the decision. The UI exposes no move, resize or create
  action; unconfirmed/rejected required crops remain publication blockers.
- Anonymous student media is served through a public application endpoint keyed by public lesson,
  immutable version and opaque asset ID. The endpoint verifies version membership server-side,
  streams the derived object with ETag/immutable cache headers and never returns Storage paths or
  source signed URLs.
- Do not add a vision-description model step. Image options receive stable neutral accessible names
  (`Изображение A`, `Изображение B`, ...) derived from display order/source labels. Treat meaningful
  non-visual access for image-only questions as an explicit release gate, not as an invented model
  description.
- Preserve explicit source labels when present; otherwise derive labels with the versioned visual
  reading-order algorithm. Stable asset/option identity is independent from mutable pre-publication
  display order and label, so teacher reordering never rewrites answer identity.
- Answer suggestions use their existing separate endpoint and provenance. A structural model response
  must never be treated as a verified answer.
- Matching and word banks render once above their group; exercise-local options remain empty when a
  shared resource is used.
- Listening without an uploaded asset renders only its response options plus a teacher-led audio
  notice; no transcript or audio URL is inferred. Image choice/matching render only source-derived
  assets with alt text and provenance.

## Validation and Observability

- Contract tests reject unknown IDs, invented text, duplicate ownership, illegal overlaps, dangling
  relationships, missing significant blocks, invalid ordering, non-atomic prompts,
  instruction/item overlap and exercises with no answer field.
- Treat every source block as untrusted quoted data. The structural prompt forbids following embedded
  instructions, and adversarial fixtures prove source content cannot change schemas, invoke tools or
  trigger persistence/publication actions.
- Window tests cover cross-page/cross-window headings, prompts, gaps, options, word banks and reference
  blocks, including identical and conflicting overlap proposals.
- Provider tests cover timeout, rate limiting, 401/402, malformed/partial output and retry exhaustion;
  every case must preserve IR and produce recoverable review without an automatic draft.
- Golden evals include English placement/matching, existing feature 001 fixtures and multilingual
  pasted text/PDF. Live-model eval is additional evidence, never a replacement for pinned assertions.
- Metrics include input size, window count, per-window duration/outcome, reconciliation conflicts,
  coverage counts and review routing. Source content and credentials are forbidden in telemetry.

## Project Structure

```text
apps/web/
├── app/api/imports/[runId]/layout-review/route.ts
├── components/review/unknown-layout-review.tsx
├── src/ai/structural-classifier.ts
├── src/imports/{build-review-draft,structural-review}.ts
└── src/inngest/reliable-ingestion.ts
packages/
├── contracts/src/{structural-classification,layout-extraction,lesson-spec}.ts
├── document-ingestion/src/{pdf-to-ir,text-to-ir,reconstructed-lines}.ts
├── exercise-extraction/src/{window-planner,reconcile-structure,validate-structure,assemble-draft}.ts
└── lesson-pipeline/src/{unknown-layout-review,observability}.ts
tests/
├── fixtures/sources/
├── golden/
├── integration/
├── resilience/
└── security/
```

**Structure Decision**: Source adapters and deterministic IR remain in document ingestion; model
contracts and global validators live in contracts/exercise extraction; provider invocation stays in
the web server boundary; persistence and workflow state remain in lesson pipeline/Supabase.

## Complexity Tracking

| Added complexity | Why required | Simpler option rejected |
|---|---|---|
| Required structural model stage | Generalizes across languages/layouts without title-specific code | Regex/fixture strategies caused omissions and empty exercises |
| Overlapping windows and reconciliation | Handles bounded requests and cross-page groups | Whole-document calls risk context/timeout failures; page-only calls split exercises |
| Separate structural review artifact | Preserves recoverability without invalid draft | Empty or partially trusted drafts violate canonical invariants |

## Post-Design Constitution Re-check

PASS. The model has a strict, versioned proposal boundary; deterministic gates retain authority over
source fidelity, coverage and publication. The design includes immutable fixtures, failure-path
evidence, owner isolation, redacted observability and backward compatibility.
