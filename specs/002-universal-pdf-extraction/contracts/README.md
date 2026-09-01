# Contract integration notes

- `layout-extraction.schema.json` is the complete internal extraction artifact contract version
  1.0.0.
- `lesson-spec-1.2.delta.schema.json` is the normative design delta for common exercise
  `sourceOrdinal`, matching and matching bank;
  implementation task T039 merges it into complete strict canonical LessonSpec, ReviewDraft and
  StudentLessonSpec schemas. It is not deployed or accepted independently as a lesson payload.
- `openapi.yaml` is the 0.4.0 API addition. Implementation merges these paths/components into the
  complete canonical OpenAPI document and keeps runtime response contract tests synchronized. Its
  layout-review submission is a strict union of supported exercise structural fields and explicit
  `reference`/`example`/`exclude` outcomes; server-side assembly preserves candidate SourceRefs.
- All new writers emit LessonSpec 1.2.0. Readers continue to accept/upcast 1.0.0 and 1.1.0 without
  rewriting immutable published versions.
- When an exercise has source numbering, the 1.2 canonical teacher contracts require
  `sourceOrdinal` independently from positive display `ordinal`. Student projection includes it only
  when needed to reproduce the visible source numbering.
