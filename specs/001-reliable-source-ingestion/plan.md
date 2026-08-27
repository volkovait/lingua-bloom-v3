# Implementation Plan: Надёжный импорт готовых упражнений

**Branch**: `001-reliable-source-ingestion` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-reliable-source-ingestion/spec.md`

## Summary

Создать первый вертикальный срез Lingua-Bloom: неизменяемый источник преобразуется в адресуемый
DocumentIR, затем детерминированные экстракторы создают кандидатов и черновик упражнений, coverage
validator проверяет полноту, учитель разрешает спорные элементы, после чего публикуется неизменяемая
LessonSpec-версия. LLM используется только для ограниченных предложений по неразрешённым answer fields через
OpenAI-compatible Responses endpoint. Каждое предложение требует явного подтверждения или исправления
учителем, сохраняется как teacherSupplied и не может напрямую публиковать урок.

## Technical Context

**Language/Version**: TypeScript 5.x в strict mode; поддерживаемая LTS-версия Node.js

**Primary Dependencies**: Next.js 16, React, Zod 4, Supabase Auth/Postgres/Storage, Inngest и
`pdfjs-dist`. Bounded Responses adapter предлагает только draft-only ответы; окончательное решение
всегда принимает учитель через review.

**Storage**: Supabase Postgres для метаданных и версий; Supabase Storage для исходных файлов;
локальная файловая система только для тестовых fixtures

**Testing**: Vitest, fast-check, Playwright, JSON Schema contract validation, offline golden evals

**Target Platform**: Серверный web-продукт; отдельные браузерные интерфейсы учителя и ученика

**Project Type**: TypeScript web application с выделенными domain, pipeline, contracts и evals
packages

**Performance Goals**: Принятие импорта менее чем за 2 секунды; прогресс первого шага менее чем за
5 секунд; p95 полного разбора одностраничного текстового PDF менее 60 секунд без OCR

**Constraints**: Нулевое число придуманных пунктов в reproduce mode; resumable/idempotent steps;
неизменяемые опубликованные версии; отдельный `StudentLessonSpec` без ключей; group-level shared resources вместо дублирования общего
материала по exercises; обязательные auth и ownership checks для teacher API, database и Storage; публичный student access по URL-safe ID с
энтропией не менее 128 бит; источники не удаляются в рамках этой feature

**Scale/Scope**: Первый release-blocking вертикальный срез на 3 supplied PDF fixtures и расширяемый
regression set уже принят независимо; text import не переоткрывает этот PDF baseline, но является
обязательным follow-up gate для полного закрытия feature 001;
один import принимает PDF до 20 страниц и 50 МиБ (52 428 800 байт) либо текст до 500 000 Unicode
code points до нормализации и создаёт не более 500 answer fields. Teacher-facing страницы используют единый server-derived
profile shell: Supabase user metadata преобразуется в display name/email и детерминированный initials-avatar,
а dropdown предоставляет основные переходы и POST sign-out без отдельной profile persistence

## Constitution Check

*GATE: Passed before Phase 0, after Phase 1 and after final T136–T140 release validation.*

- **Source Fidelity and Provenance**: PASS — все производные элементы требуют `sourceRefs`, а
  coverage report учитывает каждый кандидат; options являются адресуемыми сущностями.
- **Versioned Specifications Are Canonical**: PASS — DocumentIR и LessonSpec имеют версии
  схем, опубликованные LessonVersion неизменяемы, а изменённый PDF parser выпускается как 1.1.0;
  version-pinned regression и GenerationManifest подтверждают текущую версию.
- **Deterministic Core, Bounded AI**: PASS — маршрутизация, валидация, scoring и publish остаются в
  коде; модель не является supervisor.
- **Evaluation Before Release**: PASS — supplied fixtures являются golden cases; unit, property,
  contract, integration, browser и independent live SC-017/SC-023 gates прошли, production baseline
  продвинут только после совместного PASS.
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
  -> validate-input-limits
  -> persist-source
  -> create-run
  -> build-document-ir
  -> detect-sections
  -> extract-candidates
  -> validate-answer-field-limit
  -> assemble-draft
  -> validate-coverage
  -> suggest-unresolved-answers (optional bounded model step)
  -> wait-for-review (only when required)
  -> finalize-lesson-spec
  -> publish-version
```

`suggest-unresolved-answers` получает только известные answerFieldId и связанные с ними SourceRef
excerpts, использует versioned prompt и typed JSON output и записывает результат только как
`modelInferred`. Legacy 1.0 word-bank normalization объединяет локальные options группы в стабильном порядке первого появления, удаляя только точные дубли, и создаёт один framed shared resource перед упражнениями. Неизвестный, пропущенный или повторный answerFieldId отклоняет весь результат. Ни одно
предложение не становится publishable до отдельного confirm/edit, которое сохраняет
`teacherSupplied` и append-only ReviewDecision.

Каждый шаг имеет стабильный idempotency key `{runId}:{stepName}:{inputVersion}`. Успешный результат
шага сохраняется и не пересчитывается при ручном продолжении или восстановлении после restart.
Лимит автоматических повторов явно равен нулю: временный сбой переводит run в `failed` с
`failure.kind = retriable`, а terminal failure использует тот же статус с `failure.kind = terminal`.
Только владелец может вручную продолжить retriable run; idempotent resume начинает выполнение с
последнего успешного checkpoint. `publish-version` использует уникальное ограничение по `runId` и
версии черновика.

Model step имеет checkpoint `suggest-unresolved-answers`, делит вход на запросы максимум по 64 answer fields, выполняет не более двух запросов одновременно, использует timeout 60 секунд на каждый запрос и ноль автоматических повторов. Каждый обычный запрос содержит только одну группу; группы сохраняются целиком, пока укладываются в лимит; oversized exercise делится только по addressable answerFieldId. Поля с blocking `ANSWER_AMBIGUOUS` не отправляются модели. Model step является optional best-effort enrichment и не меняет lifecycle run. Любой HTTP/network/timeout failure, malformed typed output, unknown/duplicate/missing answerFieldId или нарушение contract/evidence validation атомарно отбрасывает весь набор suggestions, не создаёт частично обогащённый draft и не запускает retry. Workflow сохраняет deterministic base draft, redacted warning/event/manifest и продолжает в `awaiting_review`; все unresolved fields остаются `needsReview`.

Import creation uses a required client-generated `idempotencyKey` scoped to the authenticated owner.
Before returning from the atomic binding transaction, a new run records sequence 1 `accepted`; only then
does the API dispatch the external event. `accepted` with no update for 30 seconds and `processing`
without a draft/update for 3 minutes are stale delivery states, not workflow failures. Status returns
`updatedAt` plus a structured recovery descriptor and the UI stops polling. An owner-only redispatch RPC
uses a per-run advisory lock, idempotency key and durable dispatch claim before emitting an event whose
ID is derived from that claim. It rejects non-stale runs and runs with drafts. This transport recovery
does not create a new run, does not count as automatic step retry and does not replace failed-run resume.


PDF page count and byte size, and pasted-text character count, are validated before source
persistence and run creation. An ingress violation returns structured `413 SOURCE_TOO_LARGE` with
`limitType`, `limit` and `actual`. Answer-field cardinality is known only after extraction; exceeding
500 therefore terminates the existing run with terminal `SOURCE_TOO_LARGE` before draft assembly.
Both paths instruct the teacher to split the material, with every part becoming an independent
import and lesson.

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
  The product has no revoke, disable or rotate operation for this ID. Before first publication the
  teacher UI shows an irreversible-public-access warning and requires a separate confirmation.
- Original sources and derived artifacts are retained for provenance. Feature 001 exposes no source
  deletion endpoint and runs no abandoned-import or source-purge workflow. Database foreign keys use
  `ON DELETE RESTRICT`, source tables have no TTL, and `SourceRepository` exposes no delete method.
  Account/legal deletion is a separate product feature requiring its own migration and
  provenance-impact analysis.
- Observability persists ordered step events and one immutable run manifest. Для каждого model call
  manifest фиксирует provider/endpoint family, model version, prompt version, request/output schema
  versions, latency, token usage/cost (если provider возвращает usage), outcome и failure category.
  Logs exclude source content, accepted answers, session tokens, API keys and storage URLs.

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
- The clarified failure lifecycle is published as pre-release OpenAPI `0.3.0`: it removes
  `retrying`/`nextAttemptAt`, adds owner-only manual resume and adds structured limit and draft
  conflict errors. Contract fixtures and compatibility expectations move together before Phase 3.

## Draft and Published Answer Boundary

- Every mutable draft has a monotonically increasing `revision`. Each modifying request supplies the
  expected revision; persistence uses an atomic compare-and-swap update and returns
  `409 DRAFT_VERSION_CONFLICT` without partial writes when it is stale.
- `AnswerRecord` is a draft/review entity and may be `needsReview`, `rejected` or `modelInferred`.
- Published `LessonSpec` accepts only `verified` answers with non-empty accepted values and excludes
  `modelInferred` provenance. Publication projects the reviewed draft into this stricter contract.
- `validation.status = passed` is necessary but not sufficient: publish also validates every answer
  and performs repository-backed SourceRef lineage validation.
- A single deterministic `getPublicationBlockReasons` service is the authority for initial ingestion,
  review submission and final projection. A run may enter `ready_to_publish` only when this service
  returns an empty list; the database RPC independently rechecks blocking issues, coverage and answer
  state before persisting that transition. The publish API returns the same reasons to the UI.
- Text-entry comparison is delegated to a versioned subject adapter. English v1 performs only
  mechanical equivalence normalization (NFKC, apostrophes, case, whitespace, optional terminal
  punctuation and documented negative contractions); tense, auxiliary and word order remain exact.
  The canonical primitive lives in `packages/domain`, while wiring it to a student attempt endpoint
  belongs to the future grading surface and MUST reuse this primitive rather than reimplement it.

## Delivery Roadmap (rebaselined after Phase 3)

Phase 3 стала расширенным PDF vertical slice и досрочно включила возможности первоначальных Phase
5–7: teacher review и add/edit/delete, answer confirmation, durable recovery, immutable publication,
version history, stable public student link, accessibility/security/performance gates и live model
evaluation. Эти возможности считаются общей готовой платформой и не должны реализовываться повторно
для text import.

Validation issues остаются внутренним доменным состоянием, но review editor проецирует их по
`entityIds` непосредственно на exercise/option/answer controls. Severity передаётся цветом,
текстом и ARIA; отдельный issue-list view не создаётся.

### Completed release baseline

1. **Phase 1 — Repository setup**: workspace, quality commands, contracts и fixture policy.
2. **Phase 2 — Foundation**: auth/ownership, Postgres и Storage RLS, persistence, public capability
   IDs, shared assembly/coverage, durable workflow и observability primitives.
3. **Phase 3 — Extended PDF vertical slice**: deterministic single- and multi-page extraction,
   shared word banks, reference blocks, partial groups, reading association, teacher review,
   best-effort model suggestions, publication/versioning, student-safe UI и release hardening.

### Active follow-up inside feature 001

4. **Phase 4A — Deterministic text core**: raw-preserving DocumentIR, reversible normalization,
   section classification, numbering/multi-gap extraction, truncation detection и offline `raw.txt`
   golden gate. Ни один extractor на этом этапе не вызывает модель.
5. **Phase 4B — Text workflow and review integration**: подключить text branch к существующему
   durable workflow, assembler, coverage, optional answer suggestions, review editor и publish
   lifecycle; показывать рядом с редактором неизменённый вставленный текст вместо PDF viewer.
6. **Phase 4C — Text release validation**: authenticated browser journey от paste до public lesson,
   recovery/tenant-isolation regression, contract checks, updated quickstart evidence и повторный
   `$speckit-analyze`. Только после этой фазы US2 и вся feature 001 могут считаться полностью
   завершёнными, хотя PDF release profile уже готов.

### Subsequent features (outside feature 001)

Следующие направления не расширяют текущий scope молча и начинаются отдельным циклом
`specify → clarify → plan → tasks`:

1. **Feature 002 — Subject profiles and grading adapters**: вынести language-specific extraction,
   answer normalization и grading в versioned adapters; добавить второй предмет как доказательство
   расширяемости, а не обобщать архитектуру только теоретически.
2. **Feature 003 — Exercise generation from free-form material**: отдельный generate mode с
   provenance к исходному материалу, quality gates, teacher approval и независимыми evals; reproduce
   mode feature 001 остаётся детерминированным и не смешивается с generation.
3. **Feature 004 — Production operations and scale**: deployment environments, queue/concurrency
   budgets, cost/latency SLO, alerting, backup/restore, privacy/legal lifecycle и расширенный
   regression corpus. Удаление источников требует отдельного продуктового решения и migration plan.

## Post-Design Constitution Check

PASS после выполнения обновлённых Foundation и release-validation tasks. Контракты требуют provenance каждого
option/exercise/answer либо teacher decision и содержат
conditional publish invariants. API не предоставляет publish без успешного validation report и
разделяет teacher/student DTO. LessonSpec/ReviewDraft/StudentLessonSpec v1.1 добавляют ordered reference blocks, partial-group metadata, inlineGap и versioned `sharedResources`;
v1.0 остаётся читаемым для уже сохранённых версий, а writer не дублирует entries общего word bank
в exercise-local options. Data model разделяет source, draft и immutable version, а задачи
покрывают teacher auth, Storage RLS, public lesson capability IDs, optimistic draft concurrency,
structured input limits и redacted observability. Источники
не удаляются этой feature; отдельный lifecycle удаления потребуется только при появлении такой
продуктовой или юридической потребности. T136–T140 завершены: parser 1.1.0, independent live gates,
real authenticated upload/publication и повторный `$speckit-analyze` подтверждены validation report.

## Complexity Tracking

Конституционных нарушений, требующих исключения, нет.
