# Tasks: Надёжный импорт готовых упражнений

**Input**: Design documents from `/specs/001-reliable-source-ingestion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Обязательны по конституции; тестовые задачи выполняются до соответствующей реализации.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: задача может выполняться параллельно в другом файле
- **[Story]**: связь с US1–US4 из `spec.md`
- **Stable IDs**: remediation tasks T093–T122 размещены в требуемых фазах без перенумерации уже
  существующих T001–T092; порядок выполнения определяется положением и зависимостями, а не номером.

## Phase 1: Setup

**Purpose**: Воспроизводимый workspace и общие команды качества.

- [x] T001 Инициализировать pnpm workspace и root scripts в package.json и pnpm-workspace.yaml
- [x] T002 Создать Next.js 16 приложение в apps/web/package.json и apps/web/app/layout.tsx
- [x] T003 [P] Создать packages/contracts/package.json и packages/contracts/tsconfig.json
- [x] T004 [P] Создать packages/domain/package.json и packages/domain/tsconfig.json
- [x] T005 [P] Создать package manifests для document-ingestion, exercise-extraction, lesson-pipeline и evals в packages/*/package.json
- [x] T006 [P] Настроить TypeScript strict project references в tsconfig.base.json
- [x] T007 [P] Настроить lint и format scripts в eslint.config.mjs и prettier.config.mjs
- [x] T008 [P] Настроить Vitest и Playwright projects в vitest.workspace.ts и apps/web/playwright.config.ts

**Checkpoint**: `pnpm install`, `pnpm typecheck` и пустые test suites запускаются локально.

---

## Phase 2: Foundational

**Purpose**: Shared contracts, auth, persistence, public lesson access, observability и workflow primitives.

**⚠️ CRITICAL**: User story work начинается только после завершения этой фазы.

### Contracts and domain invariants

- [x] T009 Синхронизировать OpenAPI 0.3.0 и три JSON Schema из specs/001-reliable-source-ingestion/contracts в packages/contracts, обновить schema-sync test и pre-release compatibility fixtures/tests в packages/contracts/src/schema-sync.test.ts и packages/contracts/src/compatibility.test.ts
- [x] T010 [P] Реализовать Zod contracts для SourceDocument, DocumentIR и version-pinned SourceRef shape в packages/contracts/src/document-ir.ts
- [x] T011 [P] Реализовать отдельные Zod contracts для draft AnswerRecord и strict published OptionSpec, AnswerSpec, ProvenanceLink и LessonSpec в packages/contracts/src/lesson-spec.ts
- [x] T012 [P] Реализовать отдельный StudentLessonSpec без answer fields и provenance в packages/contracts/src/student-lesson-spec.ts
- [x] T013 [P] Реализовать Zod contracts для SectionSpec, ValidationIssue, CoverageReport и ReviewDecision в packages/contracts/src/validation.ts
- [x] T014 Добавить negative contract tests для non-passed published validation, ненулевых counters, needsReview/rejected/modelInferred answers, empty accepted values, option provenance, cross-document SourceRef и student key leakage в packages/contracts/src/contracts.test.ts
- [x] T015 [P] Обновить domain error taxonomy и FailureInfo: `failed + retriable + manualResumeAllowed` либо `failed + terminal`, без `retrying` и `nextAttemptAt`, в packages/domain/src/errors.ts и packages/domain/src/result.ts
- [x] T016 [P] Создать версии pipeline/parser/schema artifacts в packages/domain/src/versions.ts

### Authentication and tenant isolation

- [x] T017 [P] Добавить server-only environment validation без утечки secrets в apps/web/src/config/server-env.ts
- [x] T018 Реализовать Supabase teacher session resolver в apps/web/src/auth/require-teacher.ts
- [x] T019 Реализовать reusable API ownership guard для source, run и lesson в apps/web/src/auth/require-owned-resource.ts
- [x] T020 Создать Supabase migration для sources, IR, runs, drafts, issues, decisions, lessons, versions, events и manifests с `ON DELETE RESTRICT` для source lineage и без TTL в supabase/migrations/0001_reliable_ingestion.sql
- [x] T021 Добавить tenant-isolated Postgres RLS и immutable-version policies в supabase/migrations/0002_ingestion_rls.sql
- [x] T022 Создать private source bucket и owner-prefixed Storage policies в supabase/migrations/0003_source_storage.sql
- [x] T023 Добавить database/API/Storage cross-tenant и immutable-version tests в tests/security/tenant-isolation.test.ts, а также no-delete-API, no-TTL, repository-without-delete и source-survives-v2 assertions в tests/security/source-retention.test.ts

### Public lesson capability boundary

- [x] T024 [P] Реализовать URL-safe public lesson ID generator с CSPRNG entropy не менее 128 бит в packages/domain/src/public-lesson-id.ts
- [x] T025 Добавить immutable unique public_lesson_id, current_published_version_id и pre-0004 idempotent backfill без изменения LessonVersion payloads в supabase/migrations/0004_public_lesson_access.sql и tests/integration/public-lesson-migration.test.ts
- [x] T026 Расширить property/security tests для entropy, формата, uniqueness, stable ID after v2, indefinite access, latest-version lookup, non-enumerability и одинакового 404 в tests/security/public-lesson-access.test.ts
- [x] T027 Добавить anonymous access, uniform 404, no-public-listing, noindex и отсутствие revoke/disable/rotate API operations в apps/web/tests/api/public-lesson.contract.test.ts

### Shared ingestion and coverage services

- [x] T028 [P] Создать SourceRepository interface только с persist/read operations и без delete operation в packages/document-ingestion/src/source-repository.ts
- [x] T029 Реализовать Supabase Storage/Postgres SourceRepository adapter в packages/document-ingestion/src/supabase-source-repository.ts
- [x] T030 [P] Реализовать section taxonomy и classifier interface в packages/document-ingestion/src/section-classifier.ts
- [x] T031 [P] Реализовать shared candidate-to-draft assembler в packages/exercise-extraction/src/assemble-draft.ts
- [x] T032 Реализовать complete-accounting coverage validator в packages/exercise-extraction/src/coverage-validator.ts и repository-backed SourceRef lineage validator в packages/exercise-extraction/src/source-lineage-validator.ts

### Durable workflow and observability

- [x] T033 [P] Переработать structured run event и manifest contracts: `blocked`, `failed/retriable` с ручным resume и `failed/terminal`, без `retrying`, scheduler metadata и автоматических повторов, в packages/lesson-pipeline/src/observability.ts
- [x] T034 Реализовать ordered event и immutable manifest repository в packages/lesson-pipeline/src/observability-repository.ts
- [x] T035 Добавить redaction tests для source text, answers, tokens и signed URLs в packages/lesson-pipeline/src/observability-repository.test.ts
- [x] T036 [P] Реализовать owner-scoped import idempotency key, request fingerprint и publish uniqueness helpers в packages/lesson-pipeline/src/idempotency.ts
- [x] T037 Настроить Inngest client и typed workflow events в apps/web/src/inngest/client.ts и apps/web/src/inngest/events.ts
- [x] T038 Создать authenticated Inngest serving route в apps/web/app/api/inngest/route.ts
- [x] T113 [P] Добавить regression/contract tests для atomic accepted event, stale thresholds, polling stop, owner/idempotency и duplicate redispatch в apps/web/src/imports/stale-run-policy.test.ts и apps/web/tests/api/stale-dispatch-recovery.contract.test.ts
- [x] T114 Добавить migration 0012 с append-only dispatch claims, RLS, atomic `accepted` event и owner-only `claim_stale_import_dispatch` advisory lock/RPC

### Shared import entry point

- [x] T039 Добавить authenticated PDF/text tests для required idempotency key, exact replay, same-key/different-fingerprint 409 и exact/above ingress limits 20 pages, 52,428,800 bytes и 500,000 pre-normalization Unicode code points; проверить structured `413 SOURCE_TOO_LARGE` и отсутствие source/run/draft в apps/web/tests/api/create-import.contract.test.ts
- [x] T040 Реализовать `POST /api/imports` с pre-persistence input-limit validation, structured `413 SOURCE_TOO_LARGE`, ownership, atomic idempotency binding, single run creation и event dispatch в apps/web/app/api/imports/route.ts
- [x] T093 Добавить migration для monotonic draft revision, last successful checkpoint, failure kind и manual-resume constraints в supabase/migrations/0005_clarified_workflow.sql и migration tests в tests/integration/clarified-workflow-migration.test.ts
- [x] T094 [P] Добавить unit/boundary tests для exact/above 20 pages, 52,428,800 bytes, 500,000 pre-normalization Unicode code points и 500 answer fields, включая terminal post-extraction failure без draft, в packages/lesson-pipeline/src/import-limits.test.ts
- [x] T095 Реализовать shared pre-persistence и post-extraction import limit policies с `limitType`, `limit`, `actual` и separate-lessons guidance в packages/lesson-pipeline/src/import-limits.ts
- [x] T096 Добавить atomic compare-and-swap draft repository с all-or-nothing `DRAFT_VERSION_CONFLICT` tests в packages/lesson-pipeline/src/draft-repository.ts и packages/lesson-pipeline/src/draft-repository.test.ts
- [x] T100 [P] Добавить domain/OpenAPI contract tests для `failed/retriable`, `failed/terminal`, `manualResumeAllowed`, отсутствия `retrying`/`nextAttemptAt` и запрета resume для terminal failure в packages/domain/src/errors.test.ts и apps/web/tests/api/import-status.contract.test.ts
- [x] T115 Реализовать `updatedAt`/structured recovery в status API, остановку stale polling, last-update/event-log UI и owner-only `POST /api/imports/{runId}/dispatch` с durable claim event ID
- [x] T116 Добавить pinned Inngest CLI 1.43.0 и единый process-supervised `pnpm dev` для Next.js + Inngest
- [ ] T117 Повторно выполнить `$speckit-analyze` для constitution → spec → plan → data model → OpenAPI → tasks → regression tests и устранить critical/high findings

**Checkpoint**: Contracts запрещают unsafe states; auth/RLS/Storage изолируют teacher data; public
lesson capability IDs, source persistence, assembly, coverage, observability и import endpoint готовы.

---

## Phase 3: User Story 1 — Точный перенос PDF-теста (Priority: P1) 🎯 MVP

**Goal**: Из `1_page.pdf` получить 5 групп и 34 answerable items с option-level provenance и без
придуманных пунктов.

**Independent Test**: PDF отправляется через import UI/API; golden eval подтверждает exact counts,
порядок, interaction kinds, provenance и нулевой unsupported-addition count.

### Tests for User Story 1

- [x] T041 [P] [US1] Создать golden manifest с 5 группами, 34 пунктами и option source refs в tests/golden/1_page.expected.json
- [x] T042 [P] [US1] Добавить authenticated PDF upload browser test в apps/web/tests/e2e/create-pdf-import.spec.ts
- [x] T043 [P] [US1] Добавить PDF geometry и reading-order tests в packages/document-ingestion/src/pdf-to-ir.test.ts
- [x] T044 [P] [US1] Добавить five-interaction extractor tests в packages/exercise-extraction/src/pdf-extractors.test.ts
- [x] T045 [P] [US1] Добавить mixed-section, answer-key reconciliation и no-text-layer tests в packages/exercise-extraction/src/pdf-edge-cases.test.ts
- [x] T046 [US1] Добавить full golden evaluation для `1_page.pdf` в packages/evals/src/fixtures/one-page.eval.test.ts
- [ ] T119 [P] [US1] Добавить failing contract/golden/student-renderer tests для одного group-level wordBank
  из 7 entries, 7 resource references, пустых item-local options, single render и отсутствия answer leakage

### Implementation for User Story 1

- [x] T047 [P] [US1] Создать PDF/text import form с MIME, exact page/byte/character limits, exclusive-input validation, UUID idempotency key и `SOURCE_TOO_LARGE` guidance о самостоятельных уроках в apps/web/components/import/source-import-form.tsx
- [x] T048 [US1] Создать authenticated import page и progress redirect в apps/web/app/imports/new/page.tsx
- [x] T049 [US1] Реализовать PDF text-item и geometry DocumentIR builder в packages/document-ingestion/src/pdf-to-ir.ts
- [x] T050 [US1] Реализовать column-aware reading order в packages/document-ingestion/src/reading-order.ts
- [x] T051 [US1] Реализовать PDF section classifier для instructions, exercises, examples и answer keys в packages/document-ingestion/src/pdf-section-classifier.ts
- [x] T052 [US1] Реализовать five-interaction PDF extractors с addressable options в packages/exercise-extraction/src/pdf-extractors.ts
- [ ] T120 [US1] Версионировать LessonSpec, ReviewDraft и StudentLessonSpec до 1.1.0: добавить
  group.sharedResources discriminated union, wordBank entries/usagePolicy, sharedResourceId и v1.0 read compatibility
- [ ] T121 [US1] Изменить PDF extraction, assembly и student projection: создавать один wordBank на
  группу, сохранять provenance каждой entry и не копировать банк в options каждого wordBankGap item
- [ ] T122 [US1] Обновить review editor и student renderer: показывать общий word bank один раз после
  инструкции и перед первым использующим item, сохраняя keyboard/mobile accessibility
- [x] T053 [US1] Реализовать answer-key extractor, mapping и conflict issues в packages/exercise-extraction/src/answer-key-extractor.ts
- [x] T054 [US1] Реализовать `OCR_REQUIRED` и low-confidence review issues в packages/document-ingestion/src/pdf-text-layer-policy.ts
- [x] T105 [US1] Закрыть auth UI gap: добавить email/password и Google login, sign-up, callback,
  sign-out, safe post-auth redirect и перенаправление защищённых import pages в apps/web/app/auth и
  apps/web/src/auth
- [x] T118 [US1] Добавить server-derived teacher profile во все teacher-facing headers: автоматический
  initials-avatar, display name/email dropdown, навигацию, POST sign-out, anonymous fallback и unit/contract tests
- [x] T101 [US1] Добавить regression для реального golden PDF через server import parser, сохранить
  исходный byte buffer после PDF.js page count и externalize PDF.js в Next.js server runtime

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

- [x] T065 [P] [US3] Добавить exhaustive blocked, failed/retriable и failed/terminal status, exact `DRAFT_VERSION_CONFLICT`, review и ownership API contract tests без `retrying` в apps/web/tests/api/import-review.contract.test.ts
- [x] T066 [P] [US3] Добавить wait-for-review, manual failure resume, ordered-events, stale concurrent write и duplicate-review tests в tests/integration/review-workflow.test.ts
- [x] T067 [P] [US3] Добавить two-action navigation, keyboard, mobile и recovery Playwright tests в apps/web/tests/e2e/review-import.spec.ts

### Implementation for User Story 3

- [x] T068 [US3] Реализовать durable ingestion workflow с explicit blocked, failed/retriable и failed/terminal transitions, persisted checkpoints/events, manifest, wait-for-review и без automatic retry в apps/web/src/inngest/reliable-ingestion.ts
- [x] T069 [US3] Реализовать owned `GET /api/imports/{runId}` со structured FailureInfo и `manualResumeAllowed` без `nextAttemptAt` в apps/web/app/api/imports/[runId]/route.ts
- [x] T070 [US3] Реализовать owned idempotent review handler с atomic expected draft revision check и exact `409 DRAFT_VERSION_CONFLICT` в apps/web/app/api/imports/[runId]/review/route.ts
- [x] T071 [P] [US3] Создать source viewer с block highlighting в apps/web/components/review/source-viewer.tsx
- [x] T072 [P] [US3] Создать structured draft editor с expected revision и reload guidance после `DRAFT_VERSION_CONFLICT` в apps/web/components/review/exercise-draft-editor.tsx
- [x] T073 [P] [US3] Создать issue list и provenance badges в apps/web/components/review/validation-issues.tsx
- [x] T074 [US3] Собрать accessible responsive review workspace с отдельными blocked, manually retriable failure и terminal failure states без automatic-retry UI в apps/web/app/imports/[runId]/review/page.tsx
- [x] T097 [P] [US3] Добавить owner, idempotency, same-run checkpoint, terminal rejection и no-auto-retry contract tests для `POST /api/imports/{runId}/resume` в apps/web/tests/api/resume-import.contract.test.ts
- [x] T098 [US3] Реализовать owner-only idempotent `POST /api/imports/{runId}/resume`, продолжающий retriable run с последнего checkpoint, в apps/web/app/api/imports/[runId]/resume/route.ts
- [x] T102 [US3] Остановить review polling сразу после появления draft и покрыть policy unit tests в apps/web/src/review/polling-policy.ts
- [x] T103 [US3] Сделать все answer fields редактируемыми, потребовать подтверждение modelInferred answers и сохранять confirm/edit как teacherSupplied ReviewDecision в review UI/API
- [x] T104 [US3] Настроить bounded Responses adapter через OPENAI_BASE_URL=https://polza.ai/api/v1 и OPENAI_MODEL=openai/gpt-5.4-mini с endpoint contract test
- [x] T109 [US4] Сделать публикацию доступной из review workspace и библиотеки преподавателя: показывать ready-to-publish drafts, прямой publish CTA и причины закрытого gate; добавить navigation contract test
- [x] T110 [US4] Унифицировать publish-readiness для ingestion, review и publish через canonical validator, добавить migration 0011 с persistence recheck и показывать structured PUBLISH_BLOCKED.reasons в confirmation UI
- [x] T106 [P] [US3] Версионировать answer-suggestion prompt/input/output contracts и записывать model, prompt, schema versions, latency, token usage/cost и outcome в redacted GenerationManifest
- [x] T107 [P] [US3] Добавить независимый golden/regression evaluation bounded answer suggestions по SC-017 в apps/web/src/ai/openai-answer-suggester.live.test.ts и edge/adversarial checks в apps/web/src/ai/openai-answer-suggester.test.ts и tests/security/untrusted-source.test.ts; всегда записывать tests/golden/baseline-report.json с pass/fail, mismatches и version pins до assertion
- [x] T108 [US3] Реализовать checkpoint и `failed/retriable`/`failed/terminal` transitions bounded model step без partial draft и automatic retry, с manual resume от последнего успешного checkpoint
- [x] T111 [P] [US4] Добавить exhaustive canonical readiness regression matrix для empty reasons, каждого blocker, их комбинаций, SourceRef lineage, ingestion/review/publish equivalence и persistence recheck в packages/lesson-pipeline/src/publish-readiness.regression.test.ts и tests/integration/publish-readiness-gate.test.ts
- [x] T112 [US3] Довести version-pinned live answer-suggestion baseline до SC-017 без ослабления golden answers или порога; обновить prompt version и зафиксировать сравнение с предыдущим baseline

**Checkpoint**: Decisions append-only, stale draft даёт conflict, blocking issues не исчезают без
решения, events/manifests сохраняются без sensitive content.

---

## Phase 6: User Story 4 — Проверяемая публикация версии (Priority: P3)

**Goal**: Проверенный draft создаёт immutable LessonVersion; student получает только safe projection;
правки создают новую версию с diff.

**Independent Test**: Tests публикуют v1 и v2, доказывают database immutability, anonymous access по
непредсказуемому public ID и отсутствие keys/provenance в student API, HTML и browser state.

### Tests for User Story 4

- [x] T075 [P] [US4] Добавить publish rejection для draft-only answer states и invalid SourceRef lineage, duplicate publish и storage-level immutability tests в tests/integration/publish-version.test.ts
- [x] T076 [P] [US4] Добавить LessonSpec-to-StudentLessonSpec projection tests в packages/lesson-pipeline/src/student-projection.test.ts
- [x] T077 [P] [US4] Добавить anonymous student API/HTML key-leakage tests в tests/security/student-answer-leakage.test.ts и browser-state regression в apps/web/tests/e2e/student-answer-leakage.spec.ts
- [x] T078 [P] [US4] Добавить versioning/diff journey, permanent-access confirmation, отсутствие revoke/disable/rotate и проверку, что стабильная public link после v2 показывает v2, в apps/web/tests/e2e/lesson-versioning.spec.ts

### Implementation for User Story 4

- [x] T079 [US4] Реализовать draft-to-published projection, strict LessonSpec и repository-backed lineage validation, создание immutable public ID и атомарное продвижение latest version в packages/lesson-pipeline/src/publish-version.ts
- [x] T080 [US4] Реализовать LessonSpec-to-StudentLessonSpec projection в packages/lesson-pipeline/src/student-projection.ts
- [x] T081 [US4] Реализовать owned publish handler, требующий `confirmPermanentPublicAccess: true` при первой публикации, в apps/web/app/api/imports/[runId]/publish/route.ts
- [x] T082 [US4] Реализовать owned version-list handler в apps/web/app/api/lessons/[lessonId]/versions/route.ts
- [x] T083 [US4] Реализовать anonymous student-safe handler с lookup latest published version по public ID и uniform 404 в apps/web/app/api/lessons/[publicLessonId]/student/route.ts
- [x] T084 [P] [US4] Реализовать renderer только из StudentLessonSpec в apps/web/components/lesson/lesson-renderer.tsx
- [x] T085 [US4] Создать public student lesson page без auth и teacher payload, с noindex metadata, в apps/web/app/learn/[publicLessonId]/page.tsx
- [x] T086 [US4] Реализовать version history и diff view в apps/web/app/lessons/[lessonId]/versions/page.tsx
- [x] T099 [US4] Создать отдельное необратимое publish confirmation UI без revoke/disable/rotate controls в apps/web/components/lesson/publish-confirmation.tsx

**Checkpoint**: Published payload schema-valid и immutable; anonymous student surface доступен только
по public ID и структурно не может получить answers; новая редакция не меняет старую.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release hardening перед следующей feature.

- [x] T087 [P] Добавить timeout, restart, duplicate event, отсутствие automatic retry, idempotent manual resume и double resume cases в tests/resilience/ingestion-resilience.test.ts
- [x] T088 [P] Добавить prompt-injection, malformed PDF, MIME, exact/above every input limit, 501 answer fields и two-parts-create-independent-imports cases в tests/security/untrusted-source.test.ts
- [x] T089 [P] Добавить full accessibility matrix для upload, review и student views в apps/web/tests/e2e/accessibility.spec.ts
- [x] T090 Запустить и зафиксировать baseline metrics в tests/golden/baseline-report.json
- [ ] T091 Проверить import acceptance p95 и exact boundary behavior для 1, 5, 20/21 страниц, 52,428,800 bytes, 500,000 Unicode code points и 500/501 answer fields в packages/evals/src/performance.eval.test.ts
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
