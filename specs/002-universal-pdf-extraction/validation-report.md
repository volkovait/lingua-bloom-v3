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
