# Validation Report: Universal PDF Extraction

## Baseline live test — 2026-08-27

**Purpose**: Reproduce both reported failures before implementing feature 002. A failure here is the
expected baseline, not a release result.

**Environment**:

- Fresh Next.js 16.3.1 dev server at `http://127.0.0.1:3001`
- Fresh Inngest 1.43 dev worker at `http://127.0.0.1:8288`
- Live configured Supabase project and real authenticated teacher session
- Upload through the rendered `/imports/new` UI; import/status routes were not mocked
- Source PDFs read from `/Users/volkovaaaa/Downloads`

| Source | Run ID | Elapsed to terminal state | Result |
|---|---|---:|---|
| `vocab.pdf` | `989483c9-8e94-401d-93a2-b70acf96a729` | 6,690 ms | Expected baseline failure |
| `placement_test.pdf` | `7cde3f66-4b68-4f56-a2a8-bf3c609b0212` | 4,769 ms | Expected baseline failure |

Both runs produced the same evidence:

- `status = failed`
- `currentStep = build-document-ir`
- `lastSuccessfulCheckpoint = null`
- `draft = null`
- `failure.code = INGESTION_FAILED`
- `failure.kind = terminal`
- event sequence: `accepted → build-document-ir → ingestion-failed`
- raw failure payload exposes `groups` / `too_small` / `expected array to have >=1 items`
- no validation issue and no teacher-review fallback were created
- no model-answer event occurred; the failure precedes model enrichment
- browser console contained no application errors after the clean server restart

**Baseline conclusion**: PDF upload, authentication, persistence, dispatch and status polling work.
The deterministic extractor returns no groups for both layouts, and `buildReviewDraft` passes the
empty result into canonical validation. The resulting raw schema error confirms the root cause and
provides acceptance evidence for US1/FR-015–FR-017.

**Cleanup**: The temporary auth account was disabled. Original sources and run artifacts were
retained according to the project's provenance policy; nothing was deleted.

## US1 safety fallback live test — 2026-08-27

**Environment and scope**:

- Migration `0015_unknown_layout_review.sql` applied to the live Supabase project.
- Next.js at `http://127.0.0.1:3001` and Inngest at `http://127.0.0.1:8288`.
- Fresh authenticated teacher; real UI upload, import/status routes, Supabase and Inngest; no route
  mocks and no model request.
- UI assertion opened each review page and found the visible heading `Найдена незнакомая структура
  заданий` beside the signed source PDF.

| Source | Run ID | Elapsed | Candidates | Result |
|---|---|---:|---:|---|
| `vocab.pdf` | `aaed16b2-1d01-4e99-8697-c87c11bd27d8` | 4,943 ms | 7 | PASS |
| `placement_test.pdf` | `f2cf4374-02fd-48e0-8258-d8a4fb135ff4` | 4,039 ms | 50 | PASS |

Both runs satisfied the safety invariants:

- `status = awaiting_review` and `currentStep = await-layout-review`;
- `draft = null` while an active, non-empty `unknownLayoutReview` exists;
- one open blocking `UNSUPPORTED_LAYOUT` issue exists;
- `failure = null` and no raw Zod/schema details are exposed;
- no model event occurred, so the fallback does not depend on model availability;
- polling stopped after the unknown-layout artifact appeared and the review UI rendered it.

**Cleanup**: The temporary teacher account was disabled. The source, run, DocumentIR, issue and
unknown-review artifacts remain retained as provenance and live validation evidence.

## Teacher UI checkpoint — 2026-08-27

The teacher uploaded `placement_test.pdf` in her own authenticated browser session and opened run
`e7c0130a-3b24-4492-87b1-1cd514d29b5e`. A read-only live-state verification confirmed:

- `status = awaiting_review`, `currentStep = await-layout-review`;
- active unknown-layout review revision 1 with exactly 50 candidates;
- no lesson draft;
- one open blocking `UNSUPPORTED_LAYOUT` issue;
- ordered events `accepted → build-document-ir → await-layout-review`.

The safety fallback checkpoint is therefore accepted by the teacher. Supported-type field editing,
explicit non-student outcomes and atomic persistence are the next validation checkpoint.

## Placement vector-gap and inline-control checkpoint — 2026-08-27

The authenticated teacher re-opened `placement_test.pdf` run
`3d87394c-3db7-407d-a330-da2ef28adaf0` after the versioned parser/cache correction. Live review
showed 50 ordered candidates and 50 source-drawn gaps reconstructed as canonical inline controls.
The teacher confirmed that the missing lines were now detected and rendered correctly, and accepted
the improved dropdown presentation.

This checkpoint validates the focused T060/T062–T065 hotfix path only. It does not complete US2:
human-labelled manifests, generic grouping/options extraction, answer verification, publication and
the full teacher/student browser journey remain pending.

## Spec Kit clarification and consistency gate — 2026-08-27

One clarification was accepted: unknown candidates may be converted to a supported interaction with
editable required fields, or assigned `reference`, `example` or `teacher exclusion`. The decision
was propagated through spec, plan, tasks, data model, feature OpenAPI and quickstart. The repeated
read-only analysis mapped 44/44 requirements to 65 tasks and reported zero CRITICAL/HIGH findings.
This is an intermediate planning gate, not the final T059 release analysis.

## Phase 1 immutable acceptance evidence — 2026-08-27

All six fixture pages were rendered and visually checked against their readable text layers and
DocumentIR block geometry. The resulting human-labelled manifests preserve source typos and line
content while explicitly separating headings, instructions, questions/options and boilerplate.

| Fixture | SHA-256 | Manifest assertions | Result |
|---|---|---|---|
| `vocab.pdf` | `0d0a07161a2aac4bfc87b8dd0612d10483238bcfd04bfd60a1bc1063fb3a7ab5` | 1 matching group, example 0, 5 student items, A–F bank with 6 stable entries and block-level SourceRefs | PASS |
| `placement_test.pdf` | `0ed6ea13c458bad7476b41c586a924e41937bfb497bfe168c219818cfc493e6f` | 5 pages, Grammar 21–50, Vocabulary 51–70, 50 prompts with one canonical blank, 4 ordered options and SourceRefs per item | PASS |

Both fixtures are registered with parser `pdf-layout/1.1.0`, immutable expected manifests and their
future eval-suite paths. JSON invariants, sequential ordinals, per-item option/blank counts, unique
fixture IDs and Prettier formatting passed. Phase 1 T001–T003 is complete; Foundation T004–T013 is
the next gate.

## Release validation

US1 safety evidence is complete. Full release validation remains pending T055–T059 and the
placement/matching implementations.

## Atomic exercise ownership regression — 2026-09-02

A read-only inspection of run `1b50727c-a94c-430d-ab5f-a88a61a684c5` isolated the defect:
nine persisted exercises already had distinct prompts and one answer field each, while the group
instruction incorrectly repeated all nine source items. The source was pasted text, so the failure
was instruction projection rather than sentence/exercise segmentation.

The remediation:

- reconstructs pasted-text group instruction only from the source prefix before the first detected
  item boundary;
- pins `structural-classifier-v2` in `structure-v2`;
- adds ReconciledStructure 1.1.0 conflicts `NON_ATOMIC_EXERCISE` and
  `MIXED_INSTRUCTION_AND_ITEMS`;
- deterministically rejects overlapping prompt spans, instruction/prompt span overlap and
  non-`exercisePrompt` ownership;
- preserves multi-sentence dialogue/context when it represents one inseparable response unit,
  without punctuation- or language-specific splitting.

Deterministic validation passed 268 tests with 3 opt-in tests skipped, plus lint, typecheck and the
Next.js production build. Existing persisted drafts are immutable review artifacts; a fresh import
is required to observe the corrected instruction projection.

## ReconciledStructure compatibility and Phase 2 observability — 2026-09-02

C1 is closed with an explicit compatibility path. Repository-wide inspection found no persistence,
API or production ingestion usage of ReconciledStructure 1.0; it existed only as a pre-release
contract/test artifact. Consequently the database migration is `not applicable`. The immutable
1.0 JSON Schema is committed in package and governing-spec mirrors, the reader accepts both 1.0 and
1.1, and `upcastReconciledStructure` converts 1.0 to 1.1 in memory without rewriting the historical
`structure-v1` profile. New reconciliation writers emit 1.1 only.

T076–T077 add strict model-call, window, reconciliation and aggregate pipeline manifests. Tests prove
recursive redaction of source/answer/evidence/credential/URL fields, strict rejection of unknown
source-content fields, exact model/window/reconciliation lineage, one-time model-call ownership and
deterministically recomputed window/attempt/duration/token/cost/conflict/coverage aggregates.
Provider cost is never estimated: each call records reported cost with currency or
`costUnavailable=true`.

## Answer-suggestion cost-safety remediation — 2026-09-02

Run `edb57ada-3545-4158-96a4-26eefbf37d5c` exposed an unbounded-spend path: 369 answer fields were
sent in 11 group-isolated paid requests, consuming 42,962 tokens and USD 7.39233908 before the draft
entered teacher review. The workflow had no preflight, confirmation, budget or per-batch durability.

The remediation adds a zero-call immutable preflight, dense group-preserving packing, configurable
token/cost estimation, mandatory confirmation for large plans, a default USD 10 hard ceiling,
owner-scoped leased/completed batch checkpoints and exact plan-hash validation. Automatic ingestion
now skips large suggestion plans and persists the draft for teacher review. Completed batches of the
same run/draft revision/plan are reused; cross-draft checkpoint reuse is deliberately forbidden.

Deterministic unit/API/security tests run without provider credentials. Migration 0019 must be applied
before a browser test of the confirmed paid path; no live model call is part of this validation.


## Cost-safety analyze remediation — 2026-09-02

C1/C2 and H1–H5 were addressed in code/contracts: automatic answer suggestions were removed from ingestion; exact plan identity now includes revision, payload digests and model/prompt/schema/pricing versions; cross-run batch uniqueness was removed; expiring claims use completion tokens; paid checkpoints have indefinite `retainForProvenance`; runtime/OpenAPI responses are strict; unknown-layout review supports multiple teacher outcomes and optional checkpointed RUB-confirmed AI suggestions.

Migration `0019_answer_suggestion_cost_safety.sql` was applied to linked Supabase project
`cuuefjpbgzulpaddczkk` on 2026-09-02 after a dry-run proved that it was the only migration in the
push. `verify-live-cost-safety.mjs` then used two temporary authenticated teacher accounts and
isolated source/run/review/draft records to prove:

- concurrent answer and layout claims produce exactly one `claimed` and one `in_progress` result;
- an expired layout lease is reclaimed with a new generation token;
- completed answer and layout results return `completed` and are reused;
- checkpoint RLS hides rows from another teacher and owner-derived RPC rejects the foreign claim;
- AI checkpoint execution leaves the unknown-layout review revision unchanged;
- the test path performs no provider request and reports no cost.

Temporary checkpoints, reviews, drafts and runs were removed after the assertions. Immutable source
and DocumentIR records remain as provenance evidence; their temporary owner account was indefinitely
banned and marked `liveValidationOnly`. The outsider account without retained lineage was removed.
Two owner accounts from earlier cleanup attempts were also explicitly authorized for cleanup and
indefinitely banned. A final read-only audit confirmed that all three retained validation-lineage
owners are blocked through August 2126. T120 is complete.
