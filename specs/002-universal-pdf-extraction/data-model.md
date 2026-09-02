# Data Model: Model-Based Structural Extraction

## Canonical DocumentIR boundary

Both PDF and pasted text produce an immutable versioned `DocumentIR`. Original source blocks remain
the only authority for published text and provenance.

| Field | Rules |
|---|---|
| `id`, `sourceDocumentId` | Stable lineage; same owner as the import run |
| `parserVersion` | Required; cache reuse only for the active parser version |
| `sourceKind` | `pdf` or `text` |
| `blocks` | Ordered, addressable and non-empty for a classifiable source |
| `pageIndex`, `bbox`, `style` | Present when supplied by the PDF adapter; nullable for pasted text |
| `rawText` | Immutable source text; never replaced by model output |

PDF admission rejects `pageCount > 5`. Pasted text normalizes line endings and rejects more than
30,000 Unicode code points including whitespace. Rejected inputs do not create IR or model calls.

## ExtractionProfile

A versioned configuration pinned in every structural-classification manifest.

| Field | Rules |
|---|---|
| `version` | Immutable semantic version |
| `requestSchemaVersion`, `outputSchemaVersion`, `promptVersion` | Required |
| `maxBlocksPerWindow`, `maxInputUnits` | Positive bounded values |
| `overlapBlocks` | Positive and less than window size |
| `confidenceThreshold` | Inclusive value from 0 to 1; calibrated through evals |
| `maxAttempts`, `timeoutMs` | Positive bounded retry budget |

Changing any field creates a new profile version and new golden/live evaluation evidence.

Initial `structure-v1`: maximum 64 blocks and 12,000 estimated input tokens per window, 8-block
overlap, confidence threshold `0.80`, timeout 45 seconds, 2 attempts per window and concurrency 3.
`structure-v2` retains these bounds and changes only the pinned prompt/reconciler contract:
`structural-classifier-v2` plus ReconciledStructure 1.1.0 atomicity conflicts.

## StructuralClassificationWindow

| Field | Rules |
|---|---|
| `id`, `ordinal` | Stable for `documentIrId + profileVersion`; globally ordered |
| `documentIrId` | References exactly one immutable IR |
| `blockIds` | Ordered, unique, non-empty IDs from that IR |
| `overlapBefore`, `overlapAfter` | Block IDs also present in adjacent windows |
| `boundaryHints` | Source-only page/order context; no inferred exercise content |

Every significant block is in at least one window. Repeated membership is explicit overlap, not
duplicate ownership.

## StructuralModelCallManifest

| Field | Rules |
|---|---|
| `id`, `runId`, `documentIrId`, `windowId` | Owner-scoped immutable lineage |
| `modelId`, `promptVersion`, `inputVersion`, `outputVersion`, `profileVersion` | Required |
| `attempt`, `startedAt`, `finishedAt`, `durationMs` | Bounded retry evidence |
| `outcome` | `succeeded`, `timeout`, `rateLimited`, `authFailed`, `paymentRequired`, `invalidOutput`, `providerFailed` |
| `inputTokens`, `outputTokens` | Non-negative provider-reported usage or null when unavailable |
| `cost`, `currency`, `costUnavailable` | Provider-reported cost, or explicit unavailable flag; never silently estimated |
| `aggregateCounts` | Blocks/proposals/issues only; no source text or answers |

### Structural window and reconciliation manifests

Every window has a strict manifest containing only lineage/version IDs, block and overlap counts,
estimated input tokens, attempts, duration, outcome and model-call manifest IDs. Reconciliation has
a separate strict manifest with proposal/entity/conflict/coverage counts, validation status and
review routing. A versioned pipeline manifest owns these objects and deterministic aggregate metrics;
lineage mismatch, duplicate/missing call ownership or altered aggregates are rejected.

Raw credentials, signed URLs, full source text, model evidence and answer values are forbidden in
manifests/logs. Sources, IR, windows, proposals, reconciled structures, manifests, reviews, decisions and paid-model checkpoints inherit the
feature 001 `retainForProvenance` policy indefinitely. They have no TTL or user-facing delete API;
source lineage uses restrictive rather than cascading deletion.

## AnswerSuggestionBatchCheckpoint

Owner-scoped durable checkpoint for optional paid answer enrichment.

| Field | Rules |
|---|---|
| `runId`, `draftId`, `draftRevision`, `ownerId` | Exact immutable ownership boundary |
| `planHash`, `batchIndex`, `batchHash` | Deterministic identity; unique within revision |
| `status`, `leaseExpiresAt`, `attemptCount` | Atomic claim; stale lease is recoverable |
| `suggestions`, `telemetry` | Present only for completed batches |

A free preflight is derived before claims. Large plans require the teacher to confirm the exact
`planHash`; a changed draft/model produces a different hash and invalidates confirmation. Completed
batches of that exact run/revision/plan are reused, while cross-draft reuse is forbidden. Plan identity includes revision, exact serialized payload digests, model, prompt/input/output versions and pricing configuration. Cost
estimation is conservative and configurable; actual provider usage/cost is retained separately.

## LayoutClassificationCheckpoint

Owner-scoped `retainForProvenance` checkpoint for one optional AI review-classification plan. Identity is `(runId, reviewRevision, planHash)`; processing claims carry an expiring token, completed rows retain typed suggestions and provider telemetry indefinitely. The preflight estimates cost in RUB and requires exact teacher confirmation. Suggestions populate editable UI state only and never become teacher decisions automatically.

## StructuralProposal

A strict model-produced object for one window. Unknown fields and IDs are rejected.

| Field | Rules |
|---|---|
| `schemaVersion`, `windowId`, `documentIrId` | Must equal the request |
| `regions` | Typed semantic uses over existing block/span IDs |
| `groups` | Ordered group boundaries and instruction references |
| `exercises` | Ordered interaction proposals and component relations |
| `sharedResources` | Word/matching banks referenced by exercises |
| `coverageClaims` | Proposed role for every significant input block |
| `confidence`, `evidence` | Per proposal; evidence is concise, not hidden reasoning |

### Semantic roles

`sectionHeading`, `instruction`, `referenceMaterial`, `example`, `exercisePrompt`, `gapSegment`,
`localOption`, `sharedBankEntry`, `answerKey`, `boilerplate`, `unknown`.

### Interaction proposals

The model may select only canonical supported kinds such as `singleChoice`, `wordOrder`,
`bracketGap`, `wordBankGap`, `inlineGap`, `oddOneOut`, `shortText`, `imageChoice` and `matching`. An unsupported pattern maps to
`unknown`, never to a free-form new kind. Every assessable exercise proposal includes at least one
answer-field descriptor, even when its accepted value is not known.

### Atomic exercise ownership

An `Exercise` is the smallest independently answerable source item, not necessarily one grammatical
sentence. Its `promptRegionIds` resolve only to `exercisePrompt` regions. Different exercises
have non-overlapping prompt spans, including when one block contains several items. Instruction
regions may share a block with items only through disjoint character spans and are never prompt
regions. Multi-sentence dialogue/context remains one exercise only when it owns one inseparable
response unit. Ambiguous ownership becomes a blocking review conflict.

## ReconciledStructure

Deterministic aggregate over all window proposals.

| Field | Rules |
|---|---|
| `profileVersion`, `proposalIds` | Complete lineage |
| `regions`, `groups`, `exercises`, `sharedResources` | Globally ordered, stable IDs |
| `conflicts` | Addressable overlap/ownership/type conflicts |
| `coverage` | Exactly one outcome per significant IR block |
| `validationStatus` | `valid`, `needsReview` or `blocked` |

Only byte-identical/identity-equivalent overlap proposals may be deduplicated automatically.
Compatible continuations may be joined when their shared IDs and boundary evidence agree. All other
overlap disagreement becomes a blocking conflict. Canonical displayed text is reconstructed from the
referenced source spans; model-authored text is never persisted as source content.

`ReconciledStructure 1.1.0` adds `NON_ATOMIC_EXERCISE` for overlapping exercise prompt ownership
and `MIXED_INSTRUCTION_AND_ITEMS` for instruction/prompt overlap or invalid prompt-region roles.
The reader accepts the committed 1.0 schema and upcasts it in memory to 1.1 while preserving
`structure-v1` provenance. New reconciliation writers emit 1.1 only. Version 1.0 never reached a
persistence boundary or production release, therefore no SQL/data rewrite exists or is required.

## StructuralReview

Owner-scoped run artifact used when classification or global validation cannot create a safe draft.

| Field | Rules |
|---|---|
| `schemaVersion` | Versioned independently from LessonSpec |
| `runId`, `sourceDocumentId`, `documentIrId` | Immutable same-owner lineage |
| `revision` | Monotonic CAS revision |
| `reason` | Provider failure, invalid output, conflict, low confidence or unknown structure |
| `regions` | Every significant unresolved block/region, never an omitted subset |
| `issues` | Addressable, sanitized and actionable |
| `decisions` | Append-only teacher decisions with provenance |
| `status` | `active` or `resolved` |

An active review is mutually exclusive with an automatic draft for the same run revision. Teacher
actions may classify/edit structure or choose `reference`, `example` or `teacher exclusion`. Draft
assembly resumes only after all blocking issues and coverage gaps are resolved.

## CoverageOutcome

Every significant IR block has exactly one primary outcome:

- exercise component;
- reference material;
- example;
- answer-key evidence;
- boilerplate;
- teacher exclusion;
- unresolved issue.

A block may be referenced by a derived parent and leaf component, but leaf ownership cannot conflict.
Coverage is `passed` only when no significant block is missing and no unresolved issue remains.

## VisualRegion and DerivedMediaAsset

- `VisualRegion` stores page index, canonical PDF coordinates, detector/model confidence, SourceRef,
  current review status and immutable links to every teacher crop decision.
- `DerivedMediaAsset` stores the source visual-region ID, immutable detector rectangle, content hash,
  storage object identity, MIME type, dimensions and required alt text; it never replaces or mutates
  the original upload.
- Crop coordinates are not teacher-editable. A decision is `confirmed` or `rejected`; only a
  confirmed region may enter LessonSpec/student projection. A rejected required region leaves its
  exercise unsupported until an explicit exercise-level coverage exclusion is recorded.
- Owner-derived RLS protects source and review artifacts. A published student asset is exposed only
  through its immutable lesson version and must not reveal bucket paths, signed source URLs or
  unrelated page content.
- `PublishedMediaBinding` maps `(publicLessonId, lessonVersion, opaqueAssetId)` to exactly one
  confirmed `DerivedMediaAsset` revision. The public endpoint resolves only this binding, uses a
  content-hash ETag and returns a public-safe not-found without revealing whether an internal object
  exists.
- `displayLabel` is stable within an immutable lesson version and produces the neutral accessible
  name `Изображение {displayLabel}`. No generated semantic description is stored. Accessibility
  validation status is retained separately from media provenance and blocks release when the
  configured non-visual fallback is insufficient.
- `stableOptionId` is derived independently from `displayLabel`. `sourceLabel` is retained when
  present; otherwise `displayLabel` is assigned by a versioned visual-order manifest. A teacher
  reorder creates a decision/revision over display metadata and never rewrites the answer identity.

## LessonSpec 1.2.0 invariants

- New 1.2 writers are enabled only after schema/upcaster compatibility tests pass.
- `matching` points to one same-group `matchingBank`, has no local options and uses stable bank-entry
  IDs as accepted answers.
- Shared word/matching banks are stored once and projected once above the group.
- Every published exercise has at least one verified answer field. Structural classification may
  identify answer-key regions but cannot verify or solve answers.
- Prompt, option and shared-entry values are exact deterministic projections of IR spans or explicit
  teacher edits with decision provenance.
- Student projection removes accepted answers, confidence, model evidence and teacher/source
  provenance while retaining the structure needed to render and grade an attempt server-side.
- Readers continue accepting 1.0.0 and 1.1.0 without rewriting immutable published versions.
- `interactionKind` is independent from optional `presentationKind` (`list`, `inline`, `table`,
  `dialogue`, `imageGrid`) and `stimulusKind` (`teacherLedExternalAudio`, future `audioAsset`).
- `wordOrder` and `matching` expose draggable tokens/entries plus keyboard controls; matching bank
  entries may reference source-derived image assets instead of text, but never model-invented media.
- `shortText` owns one independently answerable row. `imageChoice` owns at least two source-derived
  image options. Missing required media lineage is a blocking validation issue.

## State transitions

```text
accepted -> processing_ir -> processing_structure
processing_structure -> validating_structure
validating_structure -> awaiting_review + ReviewDraft
processing_structure|validating_structure -> awaiting_review + StructuralReview
accepted -> blocked + SOURCE_LIMIT_EXCEEDED
StructuralReview(active) -> processing_structure -> StructuralReview(active|resolved)
StructuralReview(resolved) -> awaiting_review + ReviewDraft
```

Retries do not create duplicate windows, manifests, decisions or drafts. A stale revision returns a
conflict without partial writes.
