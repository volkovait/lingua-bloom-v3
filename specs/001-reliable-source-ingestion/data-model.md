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
`prompt`, local addressable `options`, optional `sharedResourceId`, `answerFields`, provenance,
`candidateIds`, and `reviewStatus`. Local options belong only to this item; common material is owned by
the containing group.

The containing mutable draft has a monotonically increasing integer `revision`. Every modifying
operation supplies `expectedRevision`; persistence compares and increments it atomically. A mismatch
returns `DRAFT_VERSION_CONFLICT` and applies no part of the attempted mutation.

Supported interactionKind values include `singleChoice`, `wordOrder`, `bracketGap`, `oddOneOut`, `wordBankGap`, and `inlineGap`. `inlineGap` owns one ordered answer field per source ellipsis and is language-agnostic.

Conditional invariant: `wordBankGap` requires a `sharedResourceId` resolving inside the same group to
`kind = wordBank` and requires local `options` to be empty. Other current interaction kinds do not
reference a word bank.

## ExerciseGroupDraft

Contains `id`, `ordinal`, `instruction`, provenance, ordered `sharedResources`, and ordered
`exercises`. A resource is rendered after the group instruction and before the first exercise that
references it. Multiple exercises may reference one resource; copying the resource entries into each
exercise is invalid.

Exercise groups MAY also contain `sourceOrder`, `completeness = complete | partial`, and `missingBoundary = start | end | both`. `missingBoundary` is required only for partial groups. A continuation over page or column boundaries stays in one complete group when both logical boundaries are present.

## ReferenceBlock

A non-answerable ordered source component with `id`, `ordinal`, `sourceOrder`, and ordered lines. Every line contains stable `id`, `ordinal`, exact `rawText`, and source provenance in teacher and published contracts. Student projection retains only IDs, order, and exact raw text. Reference lines are never converted into exercises or counted as answer fields.

## Teacher Exercise Mutations

`exerciseCreates` targets an existing group and provides interaction kind, prompt, local options, and one or more answer values. The server generates stable IDs; prompt and options use the created ReviewDecision as provenance and answers are immediately `teacherSupplied` plus `verified`. `exerciseDeletes` targets an existing exercise, emits an `exclude` ReviewDecision, changes each covered candidate outcome from exercise to decision, resolves issues whose entity IDs were removed, and removes an empty group. A draft must retain at least one exercise. Both mutations are atomic under expected draft revision.

## SharedExerciseResource

Versioned discriminated union for material shared by multiple exercises. The first supported variant
is `wordBank` with required `id`, `ordinal`, `kind`, optional source label, ordered addressable
`entries`, `usagePolicy`, and provenance. `usagePolicy` is `useOnce`, `reusable`, or `unspecified`;
`unspecified` is required when the source does not state whether entries may repeat. Each entry uses
the same stable ID, ordinal, value, and ProvenanceLink rules as an option.

LessonSpec and StudentLessonSpec MUST introduce this structure through schema version `1.1.0`; v1.0
read compatibility remains required for already stored drafts and published versions. Student
projection removes resource provenance but preserves ID, order, display value, label, and usage policy.

## OptionDraft

Each option or shared-resource entry has a stable `id`, display `value`, ordinal, and ProvenanceLink.
They are never stored as unaddressable strings because fidelity and review operate at entry level. A
word-bank entry is owned by its shared resource and MUST NOT be copied into exercise-local options.

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

Text-entry grading сравнивает ввод со всеми `acceptedValues` через versioned subject adapter.
English v1 нормализует Unicode/apostrophes, регистр, повторные пробелы, необязательную завершающую
пунктуацию и документированные отрицательные contractions, но не меняет auxiliary, tense или word
order. Версия policy фиксируется на уровне grading manifest, а не дублируется в каждом AnswerRecord.

## Published AnswerSpec

Strict projection used only inside an immutable LessonSpec. `reviewStatus` is always `verified`,
`acceptedValues` is non-empty, and provenance is limited to `sourceKey`, `teacherSupplied` or
`deterministicRule`. `modelInferred`, `needsReview` and `rejected` are draft-only states. Before
publication, every evidence SourceRef passes repository-backed lineage validation.

## ValidationIssue

Has stable `code`, severity (`info`, `warning`, `blocking`), affected entity IDs, evidence refs,
human-readable message, and resolution state. A blocking issue prevents publish.

Initial codes include `SOURCE_TRUNCATED`, `CANDIDATE_UNMAPPED`, `UNSUPPORTED_ADDITION`,
`ANSWER_UNVERIFIED`, `ANSWER_AMBIGUOUS`, `READING_ORDER_UNCERTAIN`, and `SOURCE_REF_MISSING`.

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
`ready_to_publish` is not inferred from issue count alone: it means the canonical publication gate
returned no reasons after checking blocking issues, unsupported additions, verified non-empty answers
and repository-backed SourceRef lineage. Any non-empty reason list keeps the run in `awaiting_review`
and is returned by publish as structured `PUBLISH_BLOCKED.reasons`.
A run stores current step, last successful checkpoint, input/output artifact IDs, idempotency keys,
event sequence and timestamps. Every new run has an `accepted` RunEvent committed in the same
transaction as the run. `updatedAt` is also the worker heartbeat used only before draft creation:
`accepted` becomes recoverable after 30 seconds and `processing` after 3 minutes.

## RunDispatchRequest

Append-only owner-scoped claim for transport recovery, separate from failed-run resume. Fields are
`id`, `runId`, `ownerId`, `idempotencyKey`, `reason` (`dispatch_not_started` or
`worker_heartbeat_expired`) and `createdAt`. An advisory lock plus the unique owner/key constraint
ensures concurrent clicks or network retries reuse one claim. A claim is allowed only for a stale
`accepted`/`processing` run with no draft; its ID becomes the durable external event ID.

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
DocumentIR 1 -> n ReferenceBlock
ExerciseGroup 0 -> n ReferenceBlock (ordered alongside by sourceOrder)
PipelineRun 1 -> 1 CoverageReport
PipelineRun 1 -> n ValidationIssue
PipelineRun 1 -> n ReviewDecision
Lesson 1 -> n LessonVersion
LessonVersion 1 -> 1 GenerationManifest
LessonVersion 1 -> 1 StudentLessonSpec projection
Lesson 1 -> 1 immutable publicLessonId
```
