# Lingua-Bloom v3

Spec-driven rebuild of Lingua-Bloom: a platform that turns teacher-provided material into a
reviewable, versioned interactive lesson.

## Current scope

The first feature deliberately covers only reliable reproduction of existing exercises:

1. preserve the immutable source;
2. build a source-addressable DocumentIR;
3. extract every exercise candidate without invention;
4. produce a coverage report and teacher-reviewable draft;
5. publish an immutable LessonSpec version only after validation passes.

Generating new exercises from free-form content is a later feature and must reuse this foundation.

## Start here

- Project rules: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Feature requirements: [`specs/001-reliable-source-ingestion/spec.md`](specs/001-reliable-source-ingestion/spec.md)
- Architecture plan: [`specs/001-reliable-source-ingestion/plan.md`](specs/001-reliable-source-ingestion/plan.md)
- Decisions: [`specs/001-reliable-source-ingestion/research.md`](specs/001-reliable-source-ingestion/research.md)
- Data model: [`specs/001-reliable-source-ingestion/data-model.md`](specs/001-reliable-source-ingestion/data-model.md)
- Ordered work: [`specs/001-reliable-source-ingestion/tasks.md`](specs/001-reliable-source-ingestion/tasks.md)
- Validation guide: [`specs/001-reliable-source-ingestion/quickstart.md`](specs/001-reliable-source-ingestion/quickstart.md)

## Spec Kit workflow

Codex skills are installed under `.agents/skills`.

```text
$speckit-constitution
$speckit-specify
$speckit-clarify
$speckit-plan
$speckit-checklist
$speckit-tasks
$speckit-analyze
$speckit-implement
$speckit-converge
```

For the current feature, constitution, specify, plan, and tasks are complete. The remediation pass
adds authenticated teacher import, option-level provenance, anonymous public lessons through
high-entropy capability IDs, student-safe contracts and complete observability gates. Source deletion
is outside the current scope. Run `$speckit-analyze` after any artifact change and only then start
Phase 1.

## First execution milestone

The first demonstration is intentionally test-only: `1_page.pdf` must produce exactly 5 groups and
34 answerable items, with zero unsupported additions, before the teacher UI is built.

Source fixtures are immutable and documented in [`tests/fixtures/README.md`](tests/fixtures/README.md).
