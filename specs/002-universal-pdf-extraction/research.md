# Research: Universal PDF Extraction

## Decision 1: Layered deterministic extraction

**Decision**: Separate reconstructed lines, boilerplate/layout regions, candidate segmentation and
interaction classification into independently versioned stages.

**Rationale**: The current parser couples exact headings, group ordinals and exercise types. A
candidate-first pipeline preserves coverage when classification fails and makes individual stages
golden-testable.

**Alternatives considered**: More fixture-specific extractors would solve only the supplied PDFs;
one model call over raw blocks would violate deterministic coverage and make failure nondiagnostic.

## Decision 2: Strategy coordinator during migration

**Decision**: Retain existing high-specificity article/reading strategies behind one coordinator,
then run generic segmentation only on unclaimed regions. Enforce exclusive region ownership.

**Rationale**: This protects feature 001 baselines while generic capabilities mature and prevents
duplicate exercises when two recognizers match the same content.

**Alternatives considered**: Immediate replacement risks regressions; running all extractors and
merging by text cannot guarantee stable identity or complete provenance.

## Decision 3: Matching contract version 1.2.0

**Decision**: Add `matching` interaction and `matchingBank` shared resource in LessonSpec and
StudentLessonSpec 1.2.0. Each answer stores a stable bank-entry ID; the source label remains metadata.

**Rationale**: Matching has group-level `useOnce` semantics and cannot be represented faithfully as
single choice or gaps. Stable IDs survive relabelling while labels retain source fidelity.

**Alternatives considered**: Reusing `wordBankGap` obscures interaction semantics; label-only
answers are unstable; rewriting 1.1.0 would break the versioning constitution.

## Decision 4: Unknown layout is a separate review artifact

**Decision**: Persist a revisioned `UnknownLayoutReview` on the pipeline run. Do not create a
ReviewDraft until at least one valid group exists and every candidate is accounted.

**Rationale**: `groups.min(1)` is a correct LessonSpec invariant. Relaxing it would move invalid
state downstream. A separate artifact gives the teacher recovery without inventing exercises.

**Alternatives considered**: A terminal error loses an actionable workflow; unknown pseudo-exercises
pollute LessonSpec; an in-memory fallback is not durable or resumable.

## Decision 5: Atomic owner-scoped review mutations

**Decision**: Store unknown review payload/revision at the run boundary and mutate it via one
owner-checked, idempotent CAS operation that also appends ReviewDecision records.

**Rationale**: This reuses established ownership, revision and audit patterns and prevents lost
updates or cross-tenant access.

**Alternatives considered**: Direct client updates bypass server validation; a second workflow
service duplicates state machinery; last-write-wins can silently lose teacher decisions.

## Decision 6: Boilerplate detection uses repeated geometry and normalized text

**Decision**: Mark page-edge lines as boilerplate only with repeated cross-page evidence, tolerating
page-number variation. Preserve marked regions for coverage/provenance.

**Rationale**: Exact string filters miss variable page numbers; deleting all page-edge text risks
removing real questions.

**Alternatives considered**: Hard-coded publisher strings do not scale; pure coordinate thresholds
are unsafe; model classification is unnecessary for repeated layout signals.

## Decision 7: Model remains optional enrichment

**Decision**: A model may receive only bounded ambiguous candidate evidence and return typed type
suggestions. Missing, invalid, 402/401 or incomplete responses leave candidates in teacher review.

**Rationale**: Imports must reach a useful review state without provider availability or credits.

**Alternatives considered**: Model-first segmentation breaks deterministic coverage; requiring a
model for fallback recreates the current terminal failure mode.

## Decision 8: Acceptance fixtures and compatibility gates

**Decision**: Copy the two source PDFs byte-for-byte into immutable fixtures, create human-labelled
manifests, add characterization tests before parser changes, and run all feature 001 baselines.

**Rationale**: The constitution requires a production defect to become a regression case and schema
changes to carry compatibility tests.

**Alternatives considered**: Synthetic PDFs cannot capture the geometry defect; snapshot-only tests
can approve omissions without explicit candidate and SourceRef assertions.
