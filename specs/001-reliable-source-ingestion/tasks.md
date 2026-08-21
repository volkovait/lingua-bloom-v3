# Tasks: Надёжный импорт готовых упражнений

**Input**: Design documents from `/specs/001-reliable-source-ingestion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Обязательны по конституции; тестовые задачи выполняются до соответствующей реализации.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: задача может выполняться параллельно в другом файле
- **[Story]**: связь с US1–US4 из `spec.md`

## Phase 1: Setup

**Purpose**: Воспроизводимый workspace и общие команды качества.

- [ ] T001 Инициализировать pnpm workspace и root scripts в package.json и pnpm-workspace.yaml
- [ ] T002 Создать Next.js 16 приложение в apps/web/package.json и apps/web/app/layout.tsx
- [ ] T003 [P] Создать packages/contracts/package.json и packages/contracts/tsconfig.json
- [ ] T004 [P] Создать packages/domain/package.json и packages/domain/tsconfig.json
- [ ] T005 [P] Создать package manifests для document-ingestion, exercise-extraction, lesson-pipeline и evals в packages/*/package.json
- [ ] T006 [P] Настроить TypeScript strict project references в tsconfig.base.json
- [ ] T007 [P] Настроить lint и format scripts в eslint.config.mjs и prettier.config.mjs
- [ ] T008 [P] Настроить Vitest и Playwright projects в vitest.workspace.ts и apps/web/playwright.config.ts

**Checkpoint**: `pnpm install`, `pnpm typecheck` и пустые test suites запускаются локально.

---

## Phase 2: Foundational

**Purpose**: Shared contracts, auth, persistence, public lesson access, observability и workflow primitives.

**⚠️ CRITICAL**: User story work начинается только после завершения этой фазы.

### Contracts and domain invariants

- [ ] T009 Перенести три JSON Schema и OpenAPI из specs/001-reliable-source-ingestion/contracts в packages/contracts, добавить schema-sync test в packages/contracts/src/schema-sync.test.ts и baseline compatibility fixtures/tests в packages/contracts/src/compatibility.test.ts
- [ ] T010 [P] Реализовать Zod contracts для SourceDocument, DocumentIR и version-pinned SourceRef shape в packages/contracts/src/document-ir.ts
- [ ] T011 [P] Реализовать отдельные Zod contracts для draft AnswerRecord и strict published OptionSpec, AnswerSpec, ProvenanceLink и LessonSpec в packages/contracts/src/lesson-spec.ts
- [ ] T012 [P] Реализовать отдельный StudentLessonSpec без answer fields и provenance в packages/contracts/src/student-lesson-spec.ts
- [ ] T013 [P] Реализовать Zod contracts для SectionSpec, ValidationIssue, CoverageReport и ReviewDecision в packages/contracts/src/validation.ts
- [ ] T014 Добавить negative contract tests для non-passed published validation, ненулевых counters, needsReview/rejected/modelInferred answers, empty accepted values, option provenance, cross-document SourceRef и student key leakage в packages/contracts/src/contracts.test.ts
- [ ] T015 [P] Создать domain error taxonomy, retriable/terminal FailureInfo и result types в packages/domain/src/errors.ts и packages/domain/src/result.ts
- [ ] T016 [P] Создать версии pipeline/parser/schema artifacts в packages/domain/src/versions.ts

### Authentication and tenant isolation

- [ ] T017 [P] Добавить server-only environment validation без утечки secrets в apps/web/src/config/server-env.ts
- [ ] T018 Реализовать Supabase teacher session resolver в apps/web/src/auth/require-teacher.ts
- [ ] T019 Реализовать reusable API ownership guard для source, run и lesson в apps/web/src/auth/require-owned-resource.ts
- [ ] T020 Создать Supabase migration для sources, IR, runs, drafts, issues, decisions, lessons, versions, events и manifests с `ON DELETE RESTRICT` для source lineage и без TTL в supabase/migrations/0001_reliable_ingestion.sql
- [ ] T021 Добавить tenant-isolated Postgres RLS и immutable-version policies в supabase/migrations/0002_ingestion_rls.sql
- [ ] T022 Создать private source bucket и owner-prefixed Storage policies в supabase/migrations/0003_source_storage.sql
- [ ] T023 Добавить database/API/Storage cross-tenant и immutable-version tests в tests/security/tenant-isolation.test.ts, а также no-delete-API, no-TTL, repository-without-delete и source-survives-v2 assertions в tests/security/source-retention.test.ts

### Public lesson capability boundary

- [ ] T024 [P] Реализовать URL-safe public lesson ID generator с CSPRNG entropy не менее 128 бит в packages/domain/src/public-lesson-id.ts
- [ ] T025 Добавить immutable unique public_lesson_id, current_published_version_id и pre-0004 idempotent backfill без изменения LessonVersion payloads в supabase/migrations/0004_public_lesson_access.sql и tests/integration/public-lesson-migration.test.ts
- [ ] T026 Добавить property/security tests для entropy, формата, uniqueness, stable ID after v2, latest-version lookup, non-enumerability и одинакового 404 в tests/security/public-lesson-access.test.ts
- [ ] T027 Добавить anonymous access, uniform 404, no-public-listing и noindex API contract tests в apps/web/tests/api/public-lesson.contract.test.ts

### Shared ingestion and coverage services

- [ ] T028 [P] Создать SourceRepository interface только с persist/read operations и без delete operation в packages/document-ingestion/src/source-repository.ts
- [ ] T029 Реализовать Supabase Storage/Postgres SourceRepository adapter в packages/document-ingestion/src/supabase-source-repository.ts
- [ ] T030 [P] Реализовать section taxonomy и classifier interface в packages/document-ingestion/src/section-classifier.ts
- [ ] T031 [P] Реализовать shared candidate-to-draft assembler в packages/exercise-extraction/src/assemble-draft.ts
- [ ] T032 Реализовать complete-accounting coverage validator в packages/exercise-extraction/src/coverage-validator.ts и repository-backed SourceRef lineage validator в packages/exercise-extraction/src/source-lineage-validator.ts

### Durable workflow and observability

- [ ] T033 [P] Создать structured run event, manifest и blocked/retrying/terminal status contracts в packages/lesson-pipeline/src/observability.ts
- [ ] T034 Реализовать ordered event и immutable manifest repository в packages/lesson-pipeline/src/observability-repository.ts
- [ ] T035 Добавить redaction tests для source text, answers, tokens и signed URLs в packages/lesson-pipeline/src/observability-repository.test.ts
- [ ] T036 [P] Реализовать owner-scoped import idempotency key, request fingerprint и publish uniqueness helpers в packages/lesson-pipeline/src/idempotency.ts
- [ ] T037 Настроить Inngest client и typed workflow events в apps/web/src/inngest/client.ts и apps/web/src/inngest/events.ts
- [ ] T038 Создать authenticated Inngest serving route в apps/web/app/api/inngest/route.ts

### Shared import entry point

- [ ] T039 Добавить authenticated PDF/text tests для required idempotency key, exact replay и same-key/different-fingerprint 409 в apps/web/tests/api/create-import.contract.test.ts
- [ ] T040 Реализовать `POST /api/imports` с validation, ownership, atomic idempotency binding, single run creation и event dispatch в apps/web/app/api/imports/route.ts

**Checkpoint**: Contracts запрещают unsafe states; auth/RLS/Storage изолируют teacher data; public
lesson capability IDs, source persistence, assembly, coverage, observability и import endpoint готовы.

---

## Phase 3: User Story 1 — Точный перенос PDF-теста (Priority: P1) 🎯 MVP

**Goal**: Из `1_page.pdf` получить 5 групп и 34 answerable items с option-level provenance и без
придуманных пунктов.

**Independent Test**: PDF отправляется через import UI/API; golden eval подтверждает exact counts,
порядок, interaction kinds, provenance и нулевой unsupported-addition count.

### Tests for User Story 1

- [ ] T041 [P] [US1] Создать golden manifest с 5 группами, 34 пунктами и option source refs в tests/golden/1_page.expected.json
- [ ] T042 [P] [US1] Добавить authenticated PDF upload browser test в apps/web/tests/e2e/create-pdf-import.spec.ts
- [ ] T043 [P] [US1] Добавить PDF geometry и reading-order tests в packages/document-ingestion/src/pdf-to-ir.test.ts
- [ ] T044 [P] [US1] Добавить five-interaction extractor tests в packages/exercise-extraction/src/pdf-extractors.test.ts
- [ ] T045 [P] [US1] Добавить mixed-section, answer-key reconciliation и no-text-layer tests в packages/exercise-extraction/src/pdf-edge-cases.test.ts
- [ ] T046 [US1] Добавить full golden evaluation для `1_page.pdf` в packages/evals/src/fixtures/one-page.eval.test.ts

### Implementation for User Story 1

- [ ] T047 [P] [US1] Создать PDF/text import form с MIME, size, exclusive-input validation и UUID idempotency key на одну user submission в apps/web/components/import/source-import-form.tsx
- [ ] T048 [US1] Создать authenticated import page и progress redirect в apps/web/app/imports/new/page.tsx
- [ ] T049 [US1] Реализовать PDF text-item и geometry DocumentIR builder в packages/document-ingestion/src/pdf-to-ir.ts
- [ ] T050 [US1] Реализовать column-aware reading order в packages/document-ingestion/src/reading-order.ts
- [ ] T051 [US1] Реализовать PDF section classifier для instructions, exercises, examples и answer keys в packages/document-ingestion/src/pdf-section-classifier.ts
- [ ] T052 [US1] Реализовать five-interaction PDF extractors с addressable options в packages/exercise-extraction/src/pdf-extractors.ts
- [ ] T053 [US1] Реализовать answer-key extractor, mapping и conflict issues в packages/exercise-extraction/src/answer-key-extractor.ts
- [ ] T054 [US1] Реализовать `OCR_REQUIRED` и low-confidence review issues в packages/document-ingestion/src/pdf-text-layer-policy.ts

**Checkpoint**: Supplied PDF проходит offline без LLM; каждый option имеет provenance; отсутствие
ключа оставляет answers в `needsReview`; scan не превращается в пустой урок.

---

## Phase 4: User Story 2 — Точный перенос вставленного текста (Priority: P1)

**Goal**: Из `raw.txt` получить 18 numbered items, 29 bracket gaps, 4 short answers и `SOURCE_TRUNCATED` без
дописывания исходника.

**Independent Test**: Текст отправляется через тот же import UI/API; golden eval подтверждает counts,
raw/normalized links и warning для оборванного пункта 18.

### Tests for User Story 2

- [ ] T055 [P] [US2] Проверить golden manifest для 18 пунктов, 29 gaps, 4 short answers и truncation в tests/golden/raw.expected.json
- [ ] T056 [P] [US2] Добавить authenticated text import browser test в apps/web/tests/e2e/create-text-import.spec.ts
- [ ] T057 [P] [US2] Добавить whitespace, line-break и split-word property tests в packages/document-ingestion/src/text-normalizer.property.test.ts
- [ ] T058 [P] [US2] Добавить truncation, multi-gap и text-section tests в packages/exercise-extraction/src/bracket-gap-extractor.test.ts

### Implementation for User Story 2

- [ ] T059 [US2] Реализовать raw-preserving text DocumentIR builder в packages/document-ingestion/src/text-to-ir.ts
- [ ] T060 [US2] Реализовать reversible normalization spans в packages/document-ingestion/src/text-normalizer.ts
- [ ] T061 [US2] Реализовать text section classification в packages/document-ingestion/src/text-section-classifier.ts
- [ ] T062 [US2] Реализовать numbering и multi-gap extraction в packages/exercise-extraction/src/bracket-gap-extractor.ts
- [ ] T063 [US2] Реализовать deterministic truncation detector в packages/exercise-extraction/src/truncation-detector.ts
- [ ] T064 [US2] Добавить full golden evaluation для `raw.txt` в packages/evals/src/fixtures/raw-text.eval.test.ts

**Checkpoint**: Text fixture проходит offline; shared SourceRepository/assembler/coverage services не
зависят от US1; обрыв не восстанавливается.

---

## Phase 5: User Story 3 — Проверка спорных элементов учителем (Priority: P2)

**Goal**: Учитель видит source/draft/issues, подтверждает ответы и не может обойти blocking gate.

**Independent Test**: Playwright journey открывает issue не более чем за два действия, подсвечивает
source ref, сохраняет teacher decision, возобновляет run и блокирует publish при оставшейся ошибке.

### Tests for User Story 3

- [ ] T065 [P] [US3] Добавить exhaustive blocked/retrying/terminal status, review и ownership API contract tests в apps/web/tests/api/import-review.contract.test.ts
- [ ] T066 [P] [US3] Добавить wait/resume, ordered-events и duplicate-review tests в tests/integration/review-workflow.test.ts
- [ ] T067 [P] [US3] Добавить two-action navigation, keyboard, mobile и recovery Playwright tests в apps/web/tests/e2e/review-import.spec.ts

### Implementation for User Story 3

- [ ] T068 [US3] Реализовать durable ingestion workflow с explicit blocked/retrying/terminal transitions, persisted events, manifest и wait-for-review в apps/web/src/inngest/reliable-ingestion.ts
- [ ] T069 [US3] Реализовать owned `GET /api/imports/{runId}` со structured FailureInfo в apps/web/app/api/imports/[runId]/route.ts
- [ ] T070 [US3] Реализовать owned idempotent review handler в apps/web/app/api/imports/[runId]/review/route.ts
- [ ] T071 [P] [US3] Создать source viewer с block highlighting в apps/web/components/review/source-viewer.tsx
- [ ] T072 [P] [US3] Создать structured draft editor в apps/web/components/review/exercise-draft-editor.tsx
- [ ] T073 [P] [US3] Создать issue list и provenance badges в apps/web/components/review/validation-issues.tsx
- [ ] T074 [US3] Собрать accessible responsive review workspace с отдельными blocked, retrying и terminal recovery states в apps/web/app/imports/[runId]/review/page.tsx

**Checkpoint**: Decisions append-only, stale draft даёт conflict, blocking issues не исчезают без
решения, events/manifests сохраняются без sensitive content.

---

## Phase 6: User Story 4 — Проверяемая публикация версии (Priority: P3)

**Goal**: Проверенный draft создаёт immutable LessonVersion; student получает только safe projection;
правки создают новую версию с diff.

**Independent Test**: Tests публикуют v1 и v2, доказывают database immutability, anonymous access по
непредсказуемому public ID и отсутствие keys/provenance в student API, HTML и browser state.

### Tests for User Story 4

- [ ] T075 [P] [US4] Добавить publish rejection для draft-only answer states и invalid SourceRef lineage, duplicate publish и storage-level immutability tests в tests/integration/publish-version.test.ts
- [ ] T076 [P] [US4] Добавить LessonSpec-to-StudentLessonSpec projection tests в packages/lesson-pipeline/src/student-projection.test.ts
- [ ] T077 [P] [US4] Добавить anonymous student API/HTML/browser key-leakage tests в tests/security/student-answer-leakage.test.ts
- [ ] T078 [P] [US4] Добавить versioning/diff journey и проверку, что стабильная public link после v2 показывает v2, в apps/web/tests/e2e/lesson-versioning.spec.ts

### Implementation for User Story 4

- [ ] T079 [US4] Реализовать draft-to-published projection, strict LessonSpec и repository-backed lineage validation, создание immutable public ID и атомарное продвижение latest version в packages/lesson-pipeline/src/publish-version.ts
- [ ] T080 [US4] Реализовать LessonSpec-to-StudentLessonSpec projection в packages/lesson-pipeline/src/student-projection.ts
- [ ] T081 [US4] Реализовать owned publish handler в apps/web/app/api/imports/[runId]/publish/route.ts
- [ ] T082 [US4] Реализовать owned version-list handler в apps/web/app/api/lessons/[lessonId]/versions/route.ts
- [ ] T083 [US4] Реализовать anonymous student-safe handler с lookup latest published version по public ID и uniform 404 в apps/web/app/api/lessons/[publicLessonId]/student/route.ts
- [ ] T084 [P] [US4] Реализовать renderer только из StudentLessonSpec в apps/web/components/lesson/lesson-renderer.tsx
- [ ] T085 [US4] Создать public student lesson page без auth и teacher payload, с noindex metadata, в apps/web/app/learn/[publicLessonId]/page.tsx
- [ ] T086 [US4] Реализовать version history и diff view в apps/web/app/lessons/[lessonId]/versions/page.tsx

**Checkpoint**: Published payload schema-valid и immutable; anonymous student surface доступен только
по public ID и структурно не может получить answers; новая редакция не меняет старую.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release hardening перед следующей feature.

- [ ] T087 [P] Добавить timeout, restart, duplicate event и double resume cases в tests/resilience/ingestion-resilience.test.ts
- [ ] T088 [P] Добавить prompt-injection, malformed PDF, MIME и oversized-input cases в tests/security/untrusted-source.test.ts
- [ ] T089 [P] Добавить full accessibility matrix для upload, review и student views в apps/web/tests/e2e/accessibility.spec.ts
- [ ] T090 Запустить и зафиксировать baseline metrics в tests/golden/baseline-report.json
- [ ] T091 Проверить import acceptance p95 и parsing limits для 1, 5 и 20 страниц в packages/evals/src/performance.eval.test.ts
- [ ] T092 Выполнить specs/001-reliable-source-ingestion/quickstart.md и записать результат в specs/001-reliable-source-ingestion/validation-report.md

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 не имеет зависимостей.
- Phase 2 зависит от Phase 1 и блокирует все user stories.
- US1 и US2 используют только Foundation и могут выполняться параллельно.
- US3 зависит от готового draft/issues из US1 или US2.
- US4 зависит от review lifecycle US3.
- Phase 7 зависит от выбранного release scope.

### User Story Dependencies

```text
Foundation -> US1 (PDF) -----+
           -> US2 (Text) ----+-> US3 (Review) -> US4 (Versions + Student-safe) -> Polish
```

### Parallel Opportunities

- T003–T008 выполняются параллельно после T001.
- Contracts, public-ID domain и observability contracts с `[P]` выполняются параллельно.
- После Foundation отдельные исполнители ведут US1 и US2 без shared незавершённых задач.
- В US3 source viewer, editor и issue list независимы до сборки workspace.
- В US4 projection/security tests и versioning tests независимы до реализации publish endpoints.

## Implementation Strategy

### MVP First

1. Выполнить Setup и Foundation целиком, включая security gates.
2. Выполнить US1 для PDF.
3. Остановиться и проверить exact golden gate без LLM.
4. Параллельно или следом выполнить US2 и повторить coverage/security gates.
5. Только затем строить review UI и publication/student surfaces.

## Notes

- Не добавлять LLM или generation-from-content в feature 001.
- Не использовать модель в supplied golden paths.
- Изменение expected counts требует изменения spec и объяснения, не обновления snapshot под результат.
- `$speckit-analyze` выполняется до `$speckit-implement`; после production defect добавляется fixture.
