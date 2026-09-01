# Data Model: Universal PDF Extraction

## ReconstructedLine

Versioned deterministic projection over one or more `DocumentIR.SourceBlock` values.

| Field | Rules |
|---|---|
| `id` | Stable within one extraction version |
| `pageIndex`, `ordinal` | Non-negative page and globally stable reading order |
| `rawText` | Source text joined without semantic rewriting |
| `normalizedText` | Classification-only projection; never replaces `rawText` |
| `bbox` | Union geometry of contributing text items |
| `sourceRefs` | Non-empty, ordered refs to every contributing block/range |
| `style` | Optional font size/weight/family and alignment evidence |

Two lines may not claim the same source range unless one is explicitly a derived parent region.

## LayoutRegion

| Field | Rules |
|---|---|
| `id`, `ordinal` | Stable and ordered |
| `kind` | `heading`, `instruction`, `question`, `optionBank`, `example`, `boilerplate`, `reference`, `unknown` |
| `lineIds` | Non-empty; each line belongs to one leaf region |
| `sourceRefs` | Resolvable union of the lines' refs |
| `evidence` | Deterministic signals and confidence, not hidden chain-of-thought |

Boilerplate remains in the extraction artifact with `kind=boilerplate`; it is excluded from lesson
prompts but not erased from coverage evidence.

## ExerciseCandidate

Detected before final interaction classification.

| Field | Rules |
|---|---|
| `id` | Stable from source lineage and parser version |
| `sourceOrdinal` | Optional number/label from source; independent from UI ordinal |
| `regionIds`, `sourceRefs` | Non-empty and resolvable |
| `rawPrompt` | Exact reconstructed source content |
| `optionCandidates` | Ordered, each with stable ID, optional source label and SourceRef |
| `classification` | `matching`, `singleChoice`, `bracketGap`, `wordBankGap`, `unknown` |
| `confidence`, `evidence` | Deterministic classifier result; model suggestion is separately marked |
| `outcome` | Exactly one of exercise, example/reference, issue, teacher decision |

## MatchingBank / MatchingEntry

`MatchingBank` is a 1.2.0 shared exercise resource with `kind=matchingBank`, stable ID, ordinal,
label, `usagePolicy=useOnce`, provenance and ordered entries. A `MatchingEntry` has stable ID,
positive ordinal, display value, source label such as `A`, and SourceRef/teacher-decision provenance.

Matching exercises have `interactionKind=matching`, empty local options, a `sharedResourceId` that
resolves to one `matchingBank` in the same group, and one answer field. The answer's accepted value
is the stable matching-entry ID. Source labels never serve as answer identity.

## UnknownLayoutReview

Run-level, owner-scoped artifact used only before canonical draft creation.

| Field | Rules |
|---|---|
| `schemaVersion` | `1.0.0` |
| `runId`, `sourceDocumentId`, `documentIrId` | Immutable lineage, all same owner |
| `revision` | Starts at 1; increments atomically after a mutation |
| `status` | `active` or `resolved`; only active fallback is returned as the editable workspace |
| `candidates` | At least one ordered unresolved candidate |
| `coverage` | Counts every detected candidate and remains `needsReview`/`blocked` |
| `createdAt`, `updatedAt` | Durable timestamps |

An active artifact is mutually exclusive with `lesson_drafts` for the same run. A resolved artifact
is retained as audit evidence and may coexist with the valid draft created from its decisions. It is
never publishable or part of StudentLessonSpec.

## UnknownCandidateDecision

Submission item with `candidateId`, required reason and one action: `classify`, `reference`,
`example` or `exclude`. A `classify` decision includes a supported interaction kind and its
discriminator-specific editable structural fields. The server validates those fields against the
current contract, binds the original candidate SourceRefs and records teacher-decision provenance;
the client cannot replace source lineage. Non-student actions map directly to explicit coverage
outcomes, with `exclude` representing `teacher exclusion`. Persistence creates or reuses an
append-only `ReviewDecision`. All items in one request apply atomically under `expectedRevision`
and idempotency key; assembly resumes only after every candidate has one valid outcome.

## LessonSpec 1.2.0 invariants

- New writers emit `schemaVersion=1.2.0`; readers continue to accept/upcast 1.0.0 and 1.1.0.
- Every 1.2 exercise MUST preserve a source ordinal/label separately from its positive display
  ordinal when the source supplies one; changing display order MUST NOT rewrite the source ordinal.
- `matching` requires exactly one `sharedResourceId` resolving to `matchingBank` and zero local
  options.
- Every accepted matching answer value resolves to an entry in that bank.
- A matching bank requires `usagePolicy=useOnce` and unique entry IDs/source labels.
- Non-matching exercises cannot reference `matchingBank`.
- Published answers remain verified, non-empty and never `modelInferred`.
- Student projection retains bank IDs, labels, values/order and policy but removes answer keys and
  provenance.

## Validation issues

Add `UNSUPPORTED_LAYOUT` for an unresolved candidate set and retain `CANDIDATE_UNMAPPED` for a
specific candidate. Both are blocking until every candidate receives an exercise or teacher-decision
outcome. Raw schema paths/stacks are server-only diagnostics and are never issue messages.

## State and persistence transitions

```text
PipelineRun.processing
  -> lesson_drafts + awaiting_review
  -> unknown_layout_reviews(revision=1) + awaiting_review

unknown layout mutation (owner + expected revision + idempotency)
  -> same artifact revision+1 while unresolved candidates remain
  -> processing when all candidates have decisions
  -> lesson_drafts + mark fallback resolved atomically after valid assembly
```

Repeated requests with the same owner/idempotency key return the original result. A stale revision
returns `DRAFT_VERSION_CONFLICT`-compatible `409` and performs no writes.

## Observability and retention

Manifests add reconstruction/classifier/contract versions, stage durations and aggregate candidate,
region, boilerplate, supported and unknown counts. They do not store raw text, answer values, signed
URLs or session data. Original PDF, DocumentIR, review decisions and derived artifacts retain the
existing provenance retention policy; feature 002 adds no deletion operation.
