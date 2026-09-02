# Research: Model-Based Structural Extraction

## Decision 1: Canonical DocumentIR precedes semantic classification

**Decision**: PDF and pasted text use separate deterministic source adapters but converge on one
immutable, versioned `DocumentIR` before semantic classification.

**Rationale**: A common boundary makes provenance, validation and model contracts independent of
input format. It also prevents a model from reading raw uploads or rewriting canonical source text.

**Alternatives considered**: Separate PDF/text classifiers would drift; sending raw PDF to the model
would weaken block-level lineage; keeping text on regex heuristics reproduces the current defect.

## Decision 2: Model proposes all semantic structure

**Decision**: A required bounded model call proposes regions, groups, exercises, prompts, gaps,
options, shared banks, examples, answer-key regions, boilerplate, unknowns and their relationships.
Production routing contains no exact-title, fixture, publisher or textbook recognizers.

**Rationale**: Exercise boundaries and roles are semantic and multilingual. Hard-coded titles solve
individual fixtures but cannot generalize and routinely omit answer fields or reference blocks.

**Alternatives considered**: Deterministic candidate detection before the model was rejected because
it still decides the most failure-prone boundary. Specialized recognizers with precedence were
rejected because they preserve fixture-specific behavior and create dual sources of truth.

## Decision 3: Deterministic validation remains authoritative

**Decision**: The model returns IDs, spans, roles, relations, confidence and concise evidence through
a strict versioned schema. Deterministic code reconstructs displayed text from IR, reconciles windows,
checks global ownership/coverage and alone decides whether draft assembly is allowed.

**Rationale**: Model-based segmentation can generalize while source fidelity and publication safety
remain reproducible and auditable.

**Alternatives considered**: Accepting model-authored prompt text permits invention; schema-only
validation misses lost blocks and conflicting ownership; letting the model publish violates the
constitution.

## Decision 4: Bounded overlapping windows

**Decision**: Classify stable overlapping windows of ordered blocks and reconcile proposals by source
identity. Window size, overlap and confidence threshold are pinned in a versioned extraction profile
and calibrated with golden/model evals.

**Rationale**: This bounds cost and latency while retaining context for a heading, shared bank or
exercise that crosses a page/window boundary.

**Alternatives considered**: One whole-document call risks token and timeout failures; independent
page calls lose cross-page relationships; splitting only after a failure makes behavior nondeterministic.

## Decision 5: Strict admission limits

**Decision**: Reject PDFs above 5 pages and pasted text above 30,000 Unicode code points, including
whitespace after newline normalization, before `DocumentIR` construction and model calls.

**Rationale**: Product scope explicitly favors predictable bounded imports over unbounded batching.
Early rejection avoids partial state and unnecessary provider cost.

**Alternatives considered**: The previous 20-page/50-MiB limit did not bound semantic workload;
truncation would silently lose source material; asynchronous unlimited chunking is outside scope.

## Decision 6: Provider failure opens durable structural review

**Decision**: Timeout, rate limit, 401/402, invalid/partial schema or reconciliation failure preserves
`DocumentIR` and opens owner-scoped review containing every significant unclassified block. No
automatic draft and no deterministic/fixture fallback is run.

**Rationale**: The teacher retains a recoverable path without silently trusting incomplete structure.
It also makes provider outages observable rather than presenting raw validation errors.

**Alternatives considered**: Terminal failure discards useful extraction; heuristic fallback repeats
the original problem; partially assembled drafts can pass incomplete material downstream.

## Decision 7: Selective structural confirmation

**Decision**: Globally valid high-confidence proposals create an editable draft. `unknown`, conflicts
and below-threshold elements become blocking review issues. Correct-answer confirmation remains a
separate publication gate.

**Rationale**: Confirming every boundary creates excessive teacher work, while accepting all
schema-valid output hides ambiguity. Separating structure and answers avoids accidental verification.

**Alternatives considered**: Confirmation of every model field was too costly; automatic trust of all
valid JSON ignored semantic uncertainty; mixing answer solving into structural classification made
failures and provenance inseparable.

## Decision 8: Matching and shared resources remain canonical domain concepts

**Decision**: LessonSpec 1.2.0 adds `matching` and `matchingBank`; stable entry IDs are answers and
source labels remain display/provenance. Existing canonical interaction kinds are reused for ordering,
choice and gaps.

**Rationale**: The classifier should map source structure into explicit domain semantics, not create
fixture-shaped payloads or duplicate shared options per exercise.

**Alternatives considered**: Reusing local single-choice options loses `useOnce`; label-only identity
is unstable; free-form model interaction names cannot be rendered or graded safely.

## Decision 9: Evaluation combines pinned and live evidence

**Decision**: Human-labelled fixtures assert exact structure, coverage and SourceRefs. Mocked contract
tests cover every failure shape. Live-model eval verifies the configured provider against the same
schemas but never updates baselines automatically.

**Rationale**: Deterministic fixtures catch regressions; live tests catch provider/prompt drift. Both
are required for a model-dependent structural stage.

**Alternatives considered**: Live-only tests are variable and credit-dependent; snapshots can bless
omissions; synthetic-only fixtures miss real PDF geometry and multilingual behavior.
