# Data Model: Надёжный импорт готовых упражнений

## SourceDocument

Неизменяемый пользовательский ввод.

| Field | Meaning | Rules |
|---|---|---|
| `id` | Stable document ID | Immutable |
| `ownerId` | Tenant/teacher owner | Required |
| `kind` | `pdf` or `text` | Required |
| `contentHash` | Source checksum | Unique within owner when deduplicating |
| `storageRef` | Original payload location | Never exposed across tenants |
| `createdAt` | Ingestion time | Immutable |
| `retentionPolicy` | `retainForProvenance` | Immutable in feature 001 |

## DocumentIR

Версионированное структурное представление источника.

| Field | Meaning | Rules |
|---|---|---|
| `schemaVersion` | IR contract version | Required |
| `sourceDocumentId` | Original source | Required |
| `pages` | Ordered pages | At least one logical page |
| `blocks` | Addressable content blocks | Stable block IDs |
| `warnings` | OCR/layout warnings | Never silently discarded |

## SourceBlock

| Field | Meaning | Rules |
|---|---|---|
| `id` | Stable block ID | Unique inside DocumentIR |
| `pageIndex` | Zero-based page | Required for PDF |
| `kind` | text, table, image, line, unknown | Required |
| `rawText` | Text as extracted | Immutable inside IR version |
| `normalizedText` | Analysis projection | Optional; never replaces raw text |
| `bbox` | Page coordinates | Optional for pasted text |
| `order` | Reading order | Unique and stable |
| `confidence` | Recognition/layout confidence | 0..1 when known |

## SourceRef

References `sourceDocumentId`, an immutable `documentIrId`, `blockId`, and an optional
character/geometry range. A reference MUST resolve inside the exact DocumentIR version from which the
derived value was produced.

## ProvenanceLink

Every source-derived or teacher-created value uses exactly one of these evidence routes:

- `sourceRefs`: one or more immutable SourceRef values; or
- `reviewDecisionIds`: one or more append-only teacher decisions explaining a created/edited value.

Values copied from a source cannot use a review decision merely to hide a missing source reference.

## ExerciseCandidate

Potential instruction, group, item, option, blank, word bank or answer-key entry detected before the
lesson is assembled.

Required fields: `id`, `candidateKind`, `sourceRefs`, `rawValue`, `normalizedValue`, `confidence`,
`status`. Status is `detected`, `mapped`, `excluded`, or `needs_review`.

## ExerciseDraft

Teacher-reviewable structured exercise. Contains `id`, `groupId`, `ordinal`, `interactionKind`,
`prompt`, addressable `options`, `answerFields`, provenance, `candidateIds`, and `reviewStatus`.

The containing mutable draft has a monotonically increasing integer `revision`. Every modifying
operation supplies `expectedRevision`; persistence compares and increments it atomically. A mismatch
returns `DRAFT_VERSION_CONFLICT` and applies no part of the attempted mutation.

Supported initial `interactionKind` values: `singleChoice`, `wordOrder`, `bracketGap`, `oddOneOut`,
and `wordBankGap`.

## OptionDraft

Each option has a stable `id`, display `value`, ordinal, and ProvenanceLink. Options are never stored
as unaddressable strings because fidelity and review operate at option level.

## Draft AnswerRecord

| Field | Meaning | Rules |
|---|---|---|
| `fieldId` | Answer field | Required |
| `acceptedValues` | Valid answers | May be empty before review |
| `provenance` | sourceKey, teacherSupplied, deterministicRule, modelInferred | Required |
| `sourceRefs` | Supporting source locations | Required for sourceKey |
| `reviewDecisionIds` | Teacher evidence | Required for teacherSupplied |
| `confidence` | Confidence when inferred | 0..1 when applicable |
| `reviewStatus` | verified, needsReview, rejected | Required |

Invariant: `verified` requires at least one accepted value. `sourceKey` requires `sourceRefs`;
`teacherSupplied` requires `reviewDecisionIds`; `modelInferred` is never represented as a source fact.

## Published AnswerSpec

Strict projection used only inside an immutable LessonSpec. `reviewStatus` is always `verified`,
`acceptedValues` is non-empty, and provenance is limited to `sourceKey`, `teacherSupplied` or
`deterministicRule`. `modelInferred`, `needsReview` and `rejected` are draft-only states. Before
publication, every evidence SourceRef passes repository-backed lineage validation.

## ValidationIssue

Has stable `code`, severity (`info`, `warning`, `blocking`), affected entity IDs, evidence refs,
human-readable message, and resolution state. A blocking issue prevents publish.

Initial codes include `SOURCE_TRUNCATED`, `CANDIDATE_UNMAPPED`, `UNSUPPORTED_ADDITION`,
`ANSWER_UNVERIFIED`, `READING_ORDER_UNCERTAIN`, and `SOURCE_REF_MISSING`.

## CoverageReport

Contains one entry per ExerciseCandidate. Each entry maps the candidate to ExerciseDraft entities, a
ValidationIssue, or a ReviewDecision. Report passes only when every candidate is accounted for and
no unsupported addition exists.

## ReviewDecision

Append-only record with actor, timestamp, decision (`confirm`, `edit`, `exclude`), reason, before and
after values, and resolved issue IDs.

## Lesson / LessonVersion

`Lesson` is the stable internal identity and owner. It also has an independent `publicLessonId`: a
URL-safe CSPRNG value with at least 128 bits of entropy, unique and immutable after first publication,
plus `currentPublishedVersionId`. `LessonVersion` is an immutable published LessonSpec plus validation
report and generation manifest. A mutable draft points to its base version; publishing creates a new
monotonically increasing version and atomically advances `currentPublishedVersionId`. Previous
versions remain available to the authenticated owner but not through the public lesson URL.

## StudentLessonSpec

Public/student projection of a published LessonVersion. It contains groups, prompts, addressable
options and empty response-field descriptors needed for rendering. Its schema has no accepted values,
correct keys, answer provenance, confidence, review decisions, coverage report or internal validation
details. It contains `publicLessonId`, not the internal lesson ID, and is generated and validated
server-side rather than redacted ad hoc in the browser.

## OwnershipBoundary

Every SourceDocument, PipelineRun, draft, ReviewDecision, Lesson and LessonVersion carries `ownerId`
directly or through a non-ambiguous parent. API routes verify the authenticated teacher before using
service-role access. Database and Storage policies independently enforce the same owner boundary.

## PipelineRun

States:

```text
accepted -> processing -> awaiting_review -> processing -> ready_to_publish -> completed
                |             |                    |
                v             +-> blocked           +-> cancelled
              failed
                |
                +-> processing (owner-triggered resume, retriable only)
```

`failed` always carries `FailureInfo`. `failure.kind = retriable` sets `manualResumeAllowed = true`;
`failure.kind = terminal` sets it to `false`. There is no `retrying` state, `nextAttemptAt`, scheduler
or automatic failure retry. Owner-triggered resume requires an idempotency key and continues the same
run from its last successful checkpoint.
`blocked` carries at least one blocking issue and requires teacher action or a replacement source.
A run stores current step, last successful checkpoint, input/output artifact IDs, idempotency keys,
event sequence and timestamps.

## GenerationManifest

Records pipeline version, schema versions, parser versions, model/provider/prompt identifiers when a
model was used, step timings, token/cost data, warnings and validation summary.

The manifest and ordered run events exclude source text, accepted answers, session credentials and
signed storage URLs. Event persistence and manifest finalization are idempotent.

## Source Retention

Feature 001 retains original sources and derived artifacts for provenance and exposes no deletion
state or source deletion endpoint. Source foreign keys use `ON DELETE RESTRICT`, storage/database
tables have no TTL, and SourceRepository has no delete operation. Automated cleanup of abandoned
imports is also excluded. Account closure and mandatory legal deletion require a later lifecycle
design that explicitly handles all dependent drafts, published versions and audit evidence.

## Import Limits

Ingress validation runs before persistence. A PDF above 20 pages or 50 MiB (52,428,800 bytes), or
pasted text above 500,000 Unicode code points counted before normalization, produces
`413 SOURCE_TOO_LARGE` and creates no SourceDocument, PipelineRun or draft. Answer-field cardinality
is validated after candidate extraction; a count above 500 marks the
existing PipelineRun as terminal `SOURCE_TOO_LARGE` and prevents draft assembly. The error records
`limitType`, `limit` and `actual`, and directs the teacher to create separate imports and lessons.

## PublicLessonAccess

Student read access is anonymous and capability-based. Only a published lesson can be resolved by its
`publicLessonId`; the lookup never accepts or returns the internal lesson ID, has no list operation,
and returns the same not-found result for unknown and unpublished IDs. A successful lookup returns
the version referenced by `currentPublishedVersionId`; publication updates this pointer only inside
the same successful transaction that creates the immutable LessonVersion.

`publicLessonId` has no revocation, disablement or rotation state and no corresponding mutation
operation. First publication requires an explicit teacher confirmation recorded after the UI warns
that the capability link remains publicly usable indefinitely.

## Relationships

```text
SourceDocument 1 -> n DocumentIR
DocumentIR 1 -> n SourceBlock
DocumentIR 1 -> n ExerciseCandidate
ExerciseCandidate n -> n ExerciseDraft
ExerciseDraft 1 -> n AnswerRecord
PipelineRun 1 -> 1 CoverageReport
PipelineRun 1 -> n ValidationIssue
PipelineRun 1 -> n ReviewDecision
Lesson 1 -> n LessonVersion
LessonVersion 1 -> 1 GenerationManifest
LessonVersion 1 -> 1 StudentLessonSpec projection
Lesson 1 -> 1 immutable publicLessonId
```
