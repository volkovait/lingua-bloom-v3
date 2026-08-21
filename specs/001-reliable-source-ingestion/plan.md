# Implementation Plan: Надёжный импорт готовых упражнений

**Branch**: `001-reliable-source-ingestion` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-reliable-source-ingestion/spec.md`

## Summary

Создать первый вертикальный срез Lingua-Bloom: неизменяемый источник преобразуется в адресуемый
DocumentIR, затем детерминированные экстракторы создают кандидатов и черновик упражнений, coverage
validator проверяет полноту, учитель разрешает спорные элементы, после чего публикуется неизменяемая
LessonSpec-версия. LLM используется только в ограниченной нормализации неоднозначных кандидатов и не
может напрямую задавать ответы или публиковать урок.

## Technical Context

**Language/Version**: TypeScript 5.x в strict mode; поддерживаемая LTS-версия Node.js

**Primary Dependencies**: Next.js 16, React, Zod 4, Supabase Auth/Postgres/Storage, Inngest и
`pdfjs-dist`. Model adapter исключён из feature 001; неоднозначность разрешается через review.

**Storage**: Supabase Postgres для метаданных и версий; Supabase Storage для исходных файлов;
локальная файловая система только для тестовых fixtures

**Testing**: Vitest, fast-check, Playwright, JSON Schema contract validation, offline golden evals

**Target Platform**: Серверный web-продукт; отдельные браузерные интерфейсы учителя и ученика

**Project Type**: TypeScript web application с выделенными domain, pipeline, contracts и evals
packages

**Performance Goals**: Принятие импорта менее чем за 2 секунды; прогресс первого шага менее чем за
5 секунд; p95 полного разбора одностраничного текстового PDF менее 60 секунд без OCR

**Constraints**: Нулевое число придуманных пунктов в reproduce mode; resumable/idempotent steps;
неизменяемые опубликованные версии; отдельный `StudentLessonSpec` без ключей; обязательные auth и
ownership checks для teacher API, database и Storage; публичный student access по URL-safe ID с
энтропией не менее 128 бит; источники не удаляются в рамках этой feature

**Scale/Scope**: Первый вертикальный срез на 2 supplied fixtures и расширяемый regression set;
до 20 страниц и 500 answer fields на документ в первой версии

## Constitution Check

*GATE: Passed before Phase 0 and re-checked after Phase 1.*

- **Source Fidelity and Provenance**: PASS — все производные элементы требуют `sourceRefs`, а
  coverage report учитывает каждый кандидат; options являются адресуемыми сущностями.
- **Versioned Specifications Are Canonical**: PASS — DocumentIR и LessonSpec имеют версии схем;
  опубликованные LessonVersion неизменяемы.
- **Deterministic Core, Bounded AI**: PASS — маршрутизация, валидация, scoring и publish остаются в
  коде; модель не является supervisor.
- **Evaluation Before Release**: PASS — supplied fixtures становятся golden cases; предусмотрены
  unit, property, contract, integration и E2E уровни.
- **Secure, Durable, Observable Execution**: PASS — источник недоверенный, background steps
  идемпотентны, Supabase session + API ownership + database/Storage RLS обеспечивают tenant isolation,
  student-safe DTO исключает ключи, public lesson lookup не требует student auth и принимает только
  непредсказуемый ID, manifest repository сохраняет версии и redacted telemetry.
- **Complexity review**: PASS — используется один durable workflow engine; Deep Agents и LangGraph
  не входят в core этой feature.

## Project Structure

### Documentation (this feature)

```text
specs/001-reliable-source-ingestion/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   ├── document-ir.schema.json
│   ├── lesson-spec.schema.json
│   └── student-lesson-spec.schema.json
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
└── web/
    ├── app/
    ├── components/
    └── tests/e2e/

packages/
├── contracts/
│   └── src/
├── domain/
│   └── src/
├── document-ingestion/
│   └── src/
├── exercise-extraction/
│   └── src/
├── lesson-pipeline/
│   └── src/
└── evals/
    └── src/

supabase/
└── migrations/

tests/
├── fixtures/sources/
├── golden/
├── integration/
├── resilience/
└── security/
```

**Structure Decision**: pnpm workspace без дополнительного monorepo-оркестратора. `apps/web`
содержит только web/API boundary; бизнес-инварианты находятся в независимых packages. Это позволяет
тестировать parser, contracts и pipeline без запуска Next.js и позднее подключить другие предметные
адаптеры.

## Workflow Design

```text
receive-source
  -> authenticate-owner
  -> validate-upload
  -> persist-source
  -> create-run
  -> build-document-ir
  -> detect-sections
  -> extract-candidates
  -> assemble-draft
  -> validate-coverage
  -> wait-for-review (only when required)
  -> finalize-lesson-spec
  -> publish-version
```

Каждый шаг имеет стабильный idempotency key `{runId}:{stepName}:{inputVersion}`. Успешный результат
шага сохраняется и не пересчитывается при retry. `publish-version` использует уникальное ограничение
по `runId` и версии черновика.

Import creation uses a required client-generated `idempotencyKey` scoped to the authenticated owner.
The server stores `{ownerId, idempotencyKey, requestFingerprint, runId}` under a unique constraint.
An identical replay returns the stored run; reuse with another fingerprint returns `409`.

`SourceRef` shape validation is followed by a repository-backed lineage check: every ref must repeat
the LessonSpec root `sourceDocumentId` and `documentIrId`, its `blockId` must exist in that immutable
DocumentIR, and optional ranges/page coordinates must stay inside the referenced block. Final publish
cannot rely on counters alone and reruns this validator.

## Security and Data Lifecycle

- Browser requests use a Supabase teacher session. Every route resolves `ownerId` on the server and
  compares it with the requested resource before any service-role access.
- Postgres RLS and Storage policies independently restrict paths to
  `{ownerId}/{sourceDocumentId}/original`; application checks are defense in depth, not a replacement.
- Teacher APIs may return `LessonSpec`; the public student API returns only `StudentLessonSpec`. The
  student contract has no fields capable of carrying accepted answers or answer provenance.
- Each lesson gets an independent URL-safe public ID generated with at least 128 bits of CSPRNG
  entropy. Student reads require no session; internal IDs, listing and enumeration endpoints remain
  private, and unknown or unpublished public IDs return the same `404` response. The ID is stable for
  the lesson and resolves through an atomically updated pointer to its latest published version.
- Original sources and derived artifacts are retained for provenance. Feature 001 exposes no source
  deletion endpoint and runs no abandoned-import or source-purge workflow. Database foreign keys use
  `ON DELETE RESTRICT`, source tables have no TTL, and `SourceRepository` exposes no delete method.
  Account/legal deletion is a separate product feature requiring its own migration and
  provenance-impact analysis.
- Observability persists ordered step events and one immutable run manifest. Logs exclude source
  content, accepted answers, session tokens and storage URLs.

## Schema Compatibility and Migration

- The committed DocumentIR, LessonSpec, StudentLessonSpec and OpenAPI contracts form the initial
  compatibility baseline. Their schema/API versions are immutable once implementation begins.
- Contract tests keep baseline fixtures readable. A breaking schema change requires a new version,
  an explicit reader/upcaster for persisted artifacts and a migration test before the baseline moves.
- Migration `0004_public_lesson_access.sql` backfills every pre-existing lesson with a unique CSPRNG
  `public_lesson_id` and a pointer to its latest published LessonVersion without rewriting immutable
  LessonVersion payloads. The migration is tested from a pre-0004 fixture and is idempotent.
- OpenAPI compatibility tests compare the committed baseline and reject removal or incompatible
  narrowing of existing teacher operations without an API version change.

## Draft and Published Answer Boundary

- `AnswerRecord` is a draft/review entity and may be `needsReview`, `rejected` or `modelInferred`.
- Published `LessonSpec` accepts only `verified` answers with non-empty accepted values and excludes
  `modelInferred` provenance. Publication projects the reviewed draft into this stricter contract.
- `validation.status = passed` is necessary but not sufficient: publish also validates every answer
  and performs repository-backed SourceRef lineage validation.

## Delivery Phases

1. **Repository foundation**: workspace, quality commands, contracts package, fixture policy.
2. **Security foundation**: teacher session boundary, API ownership, database/Storage RLS and public
   lesson capability IDs.
3. **Shared ingestion foundation**: import endpoint, source repository, DocumentIR, assembly and
   coverage services reused by PDF and text.
4. **Deterministic extraction**: groups, numbering, addressable options, gaps, word bank and order.
5. **Coverage and answer provenance**: blocking issues and publish gate.
6. **Durable workflow and observability**: retries, idempotency, persisted events/manifests and review
   wait/resume.
7. **Teacher review slice**: upload, source/draft/issues side-by-side.
8. **Versioned publish, stable latest-version public link and student-safe smoke view**.
9. **Full regression, public-access, resilience, security and cross-browser gates**.

## Post-Design Constitution Check

PASS. Контракты требуют provenance каждого option/exercise/answer либо teacher decision и содержат
conditional publish invariants. API не предоставляет publish без успешного validation report и
разделяет teacher/student DTO. Data model разделяет source, draft и immutable version, а задачи
покрывают teacher auth, Storage RLS, public lesson capability IDs и redacted observability. Источники
не удаляются этой feature; отдельный lifecycle удаления потребуется только при появлении такой
продуктовой или юридической потребности.

## Complexity Tracking

Конституционных нарушений, требующих исключения, нет.
