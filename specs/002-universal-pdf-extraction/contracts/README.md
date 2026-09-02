# Contract integration notes

- `structural-classification.schema.json` is the strict internal contract for both bounded model
  requests and proposals. The model receives only addressable `DocumentIR` blocks and returns roles,
  relationships, confidence and coverage claims. It cannot return canonical source text or answers.
- Every request/result is pinned to `documentIrId`, `windowId`, schema/profile/prompt/model versions.
  Unknown fields, unknown block IDs and unsupported interaction kinds are rejected before
  reconciliation.
- `structural-classification-prompt.md` is the version-pinned prompt contract. It treats all source
  blocks as untrusted quoted data, forbids tool/action/answer behavior and requires complete typed
  coverage claims.
- Global deterministic validation is intentionally outside the per-window model schema. It validates
  cross-window identity, overlap ownership, source projection, exercise atomicity, instruction/item
  separation, complete coverage and LessonSpec invariants before draft assembly.
- `reconciled-structure.schema.json` is the strict versioned output of that deterministic stage. It
  contains proposal lineage, globally ordered structures, conflicts, per-block coverage and final
  validation status. Version 1.1 adds `NON_ATOMIC_EXERCISE` and
  `MIXED_INSTRUCTION_AND_ITEMS` conflicts.
- `reconciled-structure-1.0.schema.json` is the immutable legacy reader contract. Runtime readers
  upcast it to 1.1 in memory while retaining `structure-v1` lineage; current writers never emit 1.0.
  No database migration is required because 1.0 was never persisted or released.
- `lesson-spec-1.2.delta.schema.json` is the normative delta for common `sourceOrdinal`, `matching`
  and `matchingBank`. Implementation merges it into the complete canonical LessonSpec, ReviewDraft
  and StudentLessonSpec schemas; the delta is not independently accepted as a lesson payload.
- `openapi.yaml` describes owner-scoped import state and structural-review mutation. `draft` and
  `structuralReview` are mutually exclusive. Provider failures retain `DocumentIR` and surface a
  sanitized recoverable review, never an automatic fallback draft.
- Structural classification and answer suggestion use separate contracts, telemetry and provenance.
  Model-classified structure never verifies a correct answer.
- New writers emit LessonSpec 1.2.0 only after compatibility gates pass. Readers continue to
  accept/upcast 1.0.0 and 1.1.0 without rewriting immutable published versions.
