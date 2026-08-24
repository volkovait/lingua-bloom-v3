# Phase 0 Research: Надёжный импорт готовых упражнений

## Decision 1: Явный workflow вместо supervisor-агента

**Decision**: Основной импорт реализуется как предопределённый durable workflow. LLM-вызов является
опциональным bounded step для неоднозначной нормализации.

**Rationale**: Порядок обработки и критерии завершения известны заранее. Динамический supervisor
увеличивает вариативность, стоимость и пространство тестирования, не создавая ценности для fidelity.

**Alternatives considered**:

- LangGraph supervisor с worker-агентами — отклонён для core из-за детерминированного маршрута.
- Deep Agents — отложен до teacher copilot и многофайлового создания курса.
- Один большой LLM prompt — отклонён из-за невозможности локализовать потерю и доказать покрытие.

## Decision 2: Один durable workflow engine

**Decision**: Для первого TypeScript/Next.js среза использовать Inngest steps для background run,
retry, ожидания review и resume.

**Rationale**: Длительная обработка не должна зависеть от времени жизни HTTP route. Сохранённые
результаты шагов уменьшают повторную стоимость после timeout и позволяют безопасно ждать teacher
review.

**Alternatives considered**:

- Next.js `after()` — подходит для коротких side effects, но ограничен максимальной длительностью
  invocation.
- LangGraph + отдельный worker — жизнеспособен, но добавляет второй runtime раньше необходимости.
- Temporal — надёжен, но избыточен для первого вертикального среза и небольшой команды.

## Decision 3: Геометрический DocumentIR

**Decision**: Сохранять raw text items, страницу, bounding box, порядок чтения и confidence. Создавать
нормализованный текст как отдельную производную проекцию.

**Rationale**: Двухколоночный PDF нельзя надёжно представить одной строкой текста. Provenance должен
указывать на визуальную область, а не только на изменяемый character offset.

**Alternatives considered**:

- Только plain text — не сохраняет колонки, таблицы и визуальные группы.
- Только изображения страниц — сохраняют вид, но не дают адресуемого текста.
- Немедленная OCR-нормализация — уничтожает различие между оригиналом и гипотезой распознавания.

## Decision 4: Extract-first с adapter boundary

**Decision**: Использовать детерминированные extractors для numbering, options, gaps и word bank.
Общий материал моделировать отдельно от items: один word bank становится group-level shared resource
с addressable entries, а использующие его упражнения хранят ссылки. Неуверенные результаты сохранять
как candidates/issues. Subject adapter отвечает только за предметную нормализацию и grading.

**Rationale**: Структурные признаки теста проверяемы кодом, а дисциплинарные правила будут меняться
при масштабировании.

**Alternatives considered**:

- Универсальный LLM extractor — недостаточно воспроизводим для zero-invention gate.
- Английская grammar logic в общем parser — блокирует расширение на другие дисциплины.
- Копировать общий word bank в options каждого item — теряет исходную структуру, раздувает payload и
  позволяет UI случайно показать один и тот же набор много раз.

## Decision 5: Contract-first и отдельные версии

**Decision**: DocumentIR и LessonSpec публикуются как JSON Schema 2020-12 и дублируются runtime
схемами из одного contracts package. Версии артефактов не зависят от версии приложения.

**Rationale**: Сохранённые уроки и pipeline checkpoints переживают обновления кода. Контрактные тесты
обнаруживают несовместимость до миграции production data.

**Alternatives considered**:

- Только TypeScript types — не валидируют persisted/runtime data.
- Неявный Zod coercion — способен скрыть потерю или изменение данных.

## Decision 6: Смешанная стратегия качества

**Decision**: Использовать exact/golden assertions для supplied fixtures, property-based invariants
для parser, integration tests для workflow и Playwright для user-visible review/publish.

**Rationale**: Один итоговый LLM score не локализует ошибки. Разные риски требуют разных graders.

**Alternatives considered**:

- Только E2E — медленно и плохо диагностирует parser regressions.
- Только LLM-as-a-judge — не подходит для точного подсчёта и provenance.

## Decision 7: Defense-in-depth tenant isolation

**Decision**: Использовать Supabase teacher session на web boundary, обязательную ownership check в
каждом route handler, Postgres RLS и отдельные Storage policies для owner-prefixed object paths.

**Rationale**: Service-role операции workflow могут обходить RLS, поэтому проверка только на одном
слое не защищает источник и draft от cross-tenant доступа.

**Alternatives considered**:

- Только API ownership checks — недостаточно при ошибке нового endpoint или прямом доступе клиента.
- Только RLS — недостаточно для service-role background execution.

## Decision 8: Separate teacher and student contracts

**Decision**: `LessonSpec` остаётся приватным authoring/grading contract, а student runtime получает
`StudentLessonSpec`, который структурно не способен содержать accepted answers, answer provenance и
внутренние validation details.

**Rationale**: Удаление полей непосредственно перед отправкой слишком легко пропустить при добавлении
нового endpoint. Раздельные schemas позволяют проверять отсутствие утечки контрактным тестом.

**Alternatives considered**:

- Один LessonSpec с runtime redaction — отклонён из-за риска случайной сериализации ключей.
- Хранить ответы в HTML — отклонён как ещё более сложный для контроля канал утечки.

## Decision 9: Preserve sources; no deletion feature

**Decision**: Original sources and derived artifacts are retained to preserve verifiable provenance.
Feature 001 has no owner-facing source deletion endpoint, abandoned-import cleanup or purge workflow.
Account closure and mandatory legal deletion are deferred to a separate feature with an explicit
migration and provenance-impact plan.

**Rationale**: The current product requires stable source evidence and does not offer source deletion.
Encoding an unused purge lifecycle would add states, jobs and failure modes with no user scenario.

**Alternatives considered**:

- Automatic 30/90-day cleanup — rejected because it can invalidate active provenance unexpectedly.
- Owner deletion in this feature — deferred until product semantics for dependent lessons are defined.

## Decision 10: Public student lessons use capability IDs

**Decision**: A published lesson is readable without student authentication through an independent,
URL-safe public ID generated with at least 128 bits of CSPRNG entropy. Internal lesson IDs are never
used in public URLs. The public ID is stable for the Lesson and resolves to its latest successfully
published LessonVersion; publishing a new version atomically advances this pointer. Unknown and
unpublished IDs return the same `404`; no public listing exists.

**Rationale**: Anonymous access keeps the student flow frictionless. A high-entropy capability link
prevents practical enumeration while preserving a fully public sharing model.

**Alternatives considered**:

- Required student accounts — rejected for the first version because viewing a shared lesson should
  not require onboarding.
- Sequential or internal database IDs — rejected because they make enumeration trivial.
- Per-version public IDs — rejected because a teacher should be able to share one durable lesson URL;
  previous versions remain available only in authenticated version history.

## Decision 11: Contract compatibility baseline

**Decision**: The contracts committed before implementation are the initial compatibility baseline.
Baseline fixtures are retained, breaking changes require a new schema/API version and persisted
artifacts use explicit readers or upcasters. The public-ID migration is tested against a pre-migration
lesson and MUST NOT rewrite immutable LessonVersion payloads.

**Rationale**: Schema sync proves that files match code but does not prove that stored lessons remain
readable or that an API change is backward-compatible.

**Alternatives considered**:

- Treat pre-production contracts as unversioned drafts — rejected because the constitution requires
  versioned canonical artifacts from the beginning.
- Rewrite all stored LessonVersion payloads — rejected because published versions are immutable.

## Decision 12: Bounded model suggestions require teacher confirmation

**Decision**: Feature 001 may call an OpenAI-compatible Responses endpoint only to suggest values for unresolved answer fields. The adapter receives a bounded structured payload, may return only known answerFieldIds, and writes draft-only `modelInferred` values. Every suggested value must be explicitly confirmed or edited by the teacher before publication; the saved result becomes `teacherSupplied` with an append-only ReviewDecision.

**Rationale**: Suggestions reduce manual entry without allowing a model response to become a published answer. Deterministic extraction, SourceRef fidelity, teacher confirmation and the publication gate remain authoritative.

## Decision 13: Separate draft and published answer states

**Decision**: Review-time `AnswerRecord` may contain unresolved or model-inferred values, but the
canonical published `LessonSpec` accepts only verified, non-empty answers with source, teacher or
deterministic provenance. Publish reruns answer and SourceRef lineage validation instead of trusting
aggregate validation counters.

**Rationale**: A permissive draft is necessary for teacher review; a permissive published contract
would allow invalid lessons to be serialized as canonical artifacts.

## Decision 14: Import idempotency is part of the API contract

**Decision**: Every import requires an owner-scoped idempotency key. The server binds it to a request
fingerprint and run ID. Exact replay returns the original run; key reuse for different content is a
conflict.

**Rationale**: Workflow step idempotency does not prevent two runs from being created before the
workflow starts.

## Decision 15: Transport redispatch is separate from workflow retry

**Decision**: Commit the initial `accepted` event with run creation, detect stale pre-draft delivery
from server timestamps, and let only the owner atomically claim an idempotent redispatch of the same
run. Local development pins Inngest CLI and supervises Next.js and the Dev Server as one process
lifecycle.

**Rationale**: An event can be accepted by the HTTP API while no worker is registered. Treating that
as active work causes infinite polling; treating it as a failed workflow step is also incorrect because
the function may never have started. A durable claim and claim-derived event ID make user-triggered
redelivery safe across double clicks and ambiguous network responses.

**Alternatives considered**:

- Infinite polling — rejected because it hides a permanently inactive worker.
- Automatic scheduler retry — rejected by FR-029 and obscures operator intent.
- Reusing failed-run resume — rejected because an `accepted` run has no failed checkpoint.
- Creating a replacement run — rejected because it duplicates the retained source and breaks import
  identity.

## Sources

- [GitHub Spec Kit workflow](https://github.github.com/spec-kit/quickstart.html)
- [LangGraph workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Next.js `after`](https://nextjs.org/docs/app/api-reference/functions/after)
- [Inngest durable execution](https://www.inngest.com/docs/learn/how-functions-are-executed)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
