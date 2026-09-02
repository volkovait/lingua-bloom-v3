# Feature Specification: Universal PDF Extraction

**Feature Branch**: `002-universal-pdf-extraction`

**Created**: 2026-08-27

**Status**: In progress — clarification reopened for model-based structural extraction

**Input**: Two valid PDFs with readable text layers (`vocab.pdf` and `placement_test.pdf`) expose
fixture-specific extraction and an unhandled empty-group validation error. Build a layout-aware,
coverage-safe extraction capability without weakening the fidelity guarantees of feature 001.

The revised direction removes fixture-title recognizers from the production path. After deterministic
`DocumentIR` construction, a bounded model call proposes semantic regions, exercise boundaries and
relationships; deterministic code validates source fidelity, coverage, contracts and publication.

## Clarifications

### Session 2026-08-27

- Q: Как представить matching? → A: Ввести самостоятельный `matching` interaction kind и новую
  версию canonical contract.
- Q: Как хранить правильную пару matching? → A: Stable shared-entry ID является каноническим
  ответом; исходная буква A–F сохраняется отдельно для отображения и provenance.
- Q: Что показывать при неизвестной структуре? → A: Открывать отдельный teacher-review режим с
  обнаруженными unknown candidates, где учитель может классифицировать или исключить каждый из них;
  до этого canonical lesson draft не создаётся.
- Q: Что учитель может сделать с неизвестным кандидатом? → A: Выбрать поддерживаемый тип
  упражнения и отредактировать его структурные поля либо назначить outcome `reference`, `example`
  или `teacher exclusion`; все решения сохраняют source provenance и coverage accounting.

### Session 2026-09-02

- Q: Какие варианты доступны при ручной классификации unknown candidate? → A: Учитель может выбрать поддерживаемый `singleChoice`, `wordOrder`, `bracketGap`, `oddOneOut` или `inlineGap`, назначить `reference`/`example` либо явно исключить фрагмент. ИИ-классификация необязательна, показывает бесплатный preflight и примерную стоимость в рублях и запускается только после отдельного подтверждения; предложения ИИ не сохраняются без подтверждения учителя.

- Product direction: модель MUST разделять `DocumentIR` на semantic regions, groups, exercises,
  individual prompts, gaps, local options, shared matching/word-bank entries, examples, answer keys,
  reference material, boilerplate и `unknown`. Точные fixture-specific заголовки MUST быть удалены
  из production routing. Детерминированный код сохраняет контроль над schema validation, provenance,
  coverage, security, persistence и publication gates.
- Q: Что должно происходить, если structural-classification модель недоступна или возвращает
  невалидный результат? → A: Сохранить `DocumentIR`, не создавать automatic draft и открыть
  recoverable teacher-review со всеми неклассифицированными значимыми блоками.
- Q: Как обрабатывать большие и многостраничные `DocumentIR`? → A: Не принимать PDF длиннее
  5 страниц и pasted text длиннее 30 000 Unicode-символов; допустимый `DocumentIR`
  классифицировать перекрывающимися окнами blocks с детерминированным reconciliation результатов.
- Q: Какой максимальный размер установить для pasted text? → A: 30 000 Unicode-символов после
  нормализации переносов строк, включая пробелы; лимит проверяется до построения `DocumentIR` и
  model calls.
- Q: Какие structural decisions модели учитель должен подтверждать вручную? → A: Прошедший
  deterministic validation результат сразу формирует редактируемый draft; отдельное подтверждение
  обязательно для `unknown`, конфликтов и элементов ниже versioned confidence threshold. Answer
  verification остаётся независимым publication gate.
- Q: Для каких source kinds применять model-based structural classification? → A: И PDF, и pasted
  text MUST сначала преобразовываться в общий `DocumentIR`, а затем проходить один versioned
  structural-classification contract и одинаковые deterministic validation gates.
- Q: Как разделять список предложений, находящийся в одном source block? → A: Наименьший
  независимо отвечаемый source item является атомарным `Exercise`. Инструкция принадлежит group,
  соседние items не включаются в prompt; несколько предложений остаются вместе только когда они
  образуют одну неделимую единицу ответа. Для нескольких items в одном block модель MUST вернуть
  непересекающиеся character spans, иначе validator создаёт blocking conflict.

### Session 2026-09-03

- Q: Как отображать задания на порядок слов и соответствие? → A: Всегда как drag-and-drop;
  canonical answer для matching остаётся stable ID элемента общего банка.
- Q: Как публиковать listening до поддержки аудиофайлов? → A: Как teacher-led stimulus: ученику
  показываются только варианты ответа, а аудио воспроизводит учитель вне сервиса.
- Q: Нужны ли задания с изображениями? → A: Да. Ввести `imageChoice` и image-backed matching bank;
  если визуальные regions не извлечены достоверно, публикация блокируется до teacher review.
- Q: Как представить строки со свободным вводом? → A: Отдельным `shortText` interaction kind;
  одна независимо отвечаемая строка является одним Exercise.
- Q: Что делать, если границы изображений определены неуверенно? → A: В teacher review учитель
  видит предложенные crop-рамки поверх PDF и подтверждает либо отклоняет их. Рамки нельзя
  перемещать, изменять или создавать вручную; отклонённая обязательная карточка оставляет
  упражнение unsupported и блокирует публикацию, пока упражнение не исключено явным coverage
  decision.
- Q: Как отдавать подтверждённые изображения анонимному ученику? → A: Через стабильный публичный
  media endpoint приложения, который проверяет `publicLessonId`, immutable lesson version и
  принадлежность asset этому уроку. Bucket path и source signed URL ученику не раскрываются.
- Q: Кто создаёт первоначальный alt-текст изображения? → A: Vision-модель не вызывается; система
  назначает нейтральную функциональную подпись по стабильному порядку (`Изображение A`,
  `Изображение B`, ...). Подпись идентифицирует вариант, но не описывает визуальное содержимое;
  это ограничение MUST быть явно проверено accessibility gate до релиза image-only заданий.
- Q: Как назначать буквы нейтральным подписям изображений? → A: Сохранять исходные A/B/C, если они
  присутствуют в source region; иначе назначать буквы по детерминированному визуальному порядку
  чтения. Учитель может изменить порядок до публикации, не меняя stable asset/option ID.
- Q: Какие действия с image options доступны в crop-review? → A: Только подтвердить или отклонить
  предложенные системой рамки. Ручное добавление, удаление через изменение структуры, перемещение и
  resize рамок не поддерживаются. Это решение заменяет ранее рассмотренный вариант crop editor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Понятный результат для неизвестной разметки (Priority: P1)

Учитель загружает исправный PDF с читаемым текстом. Даже если система пока не умеет распознать его
структуру, учитель получает понятный результат и может понять, что делать дальше, а не внутреннюю
ошибку схемы.

**Why this priority**: Необработанная техническая ошибка делает весь импорт ненадёжным и скрывает
тот факт, что сам документ был прочитан успешно.

**Independent Test**: Загрузить документ с читаемым text layer и найденными кандидатами, но без
поддержанного типа упражнения. Импорт должен сохранить источник и результаты чтения, полностью
учесть кандидатов и завершиться определённым пользовательским состоянием без raw validation error.

**Acceptance Scenarios**:

1. **Given** PDF имеет читаемый текстовый слой и содержит кандидаты упражнений, **When** ни один
   кандидат не классифицирован в поддерживаемую группу, **Then** система не создаёт невалидный
   черновик и не показывает внутренний validation payload.
2. **Given** часть кандидатов распознана, а часть неоднозначна, **When** импорт доходит до проверки,
   **Then** каждый кандидат учтён как упражнение, справочный блок, пример, явное исключение или
   blocking issue.
3. **Given** документ не имеет пригодного текстового слоя, **When** начинается анализ, **Then**
   сохраняется уже определённое состояние необходимости OCR, а неизвестная layout-разметка не
   подменяет эту причину.

---

### User Story 2 - Перенос многостраничного placement test (Priority: P2)

Учитель загружает пятистраничный placement test с секциями Grammar и Vocabulary, вопросами 21–70,
четырьмя вариантами a–d и переносами формулировок между визуальными строками. Система создаёт 50
single-choice заданий без headers, footers и служебного текста.

**Why this priority**: Этот пример проверяет наиболее распространённую структуру теста, но ломает
текущие предположения о нумерации с единицы, однострочных вопросах и подчёркнутых пропусках.

**Independent Test**: Импортировать `placement_test.pdf` и получить две упорядоченные секции, 50
заданий с исходными номерами 21–70 и ровно четырьмя вариантами в каждом.

**Acceptance Scenarios**:

1. **Given** первый вопрос имеет исходный номер 21, **When** система определяет последовательность,
   **Then** она принимает локально последовательные номера 21–70 и не требует начала с единицы.
2. **Given** формулировка занимает несколько строк или блоков, **When** собирается кандидат,
   **Then** все слова остаются в prompt до начала вариантов следующего уровня.
3. **Given** варианты представлены последовательностью a–d, **When** создаётся задание, **Then**
   порядок и текст всех четырёх вариантов сохраняются с отдельными SourceRef.
4. **Given** на каждой странице повторяются header, footer, номер страницы и переходная подсказка,
   **When** собираются группы, **Then** этот boilerplate не попадает в prompts или options.
5. **Given** в PDF нет answer key, **When** черновик создан, **Then** ответы остаются
   неподтверждёнными и блокируют публикацию до решения учителя.

---

### User Story 3 - Перенос matching с общим банком (Priority: P3)

Учитель загружает vocabulary worksheet с инструкцией Match, примером 0, пятью левыми частями 1–5 и
общим банком A–F. Ученику показывается один общий банк и пять оцениваемых заданий, а не локальные
копии всех вариантов.

**Why this priority**: Matching имеет групповое ограничение «использовать вариант один раз», которое
нельзя корректно выразить существующими single-choice или odd-one-out типами.

**Independent Test**: Импортировать `vocab.pdf` и получить одну группу из пяти заданий, один общий
банк A–F и отдельно учтённый пример 0.

**Acceptance Scenarios**:

1. **Given** инструкция содержит Match и рядом находятся numbered left side и lettered shared bank,
   **When** система классифицирует группу, **Then** создаётся matching-взаимодействие, а не
   odd-one-out по номеру группы.
2. **Given** пункт 0 показывает готовую пару, **When** формируется ученический урок, **Then** пример
   учитывается в coverage, но не становится оцениваемым заданием.
3. **Given** банк содержит A–F, **When** строится draft и student lesson, **Then** шесть entries
   показываются один раз над группой и не копируются в каждое задание.
4. **Given** инструкция требует одноразового использования, **When** ученик выбирает вариант,
   **Then** вариант не может быть назначен второму заданию в той же попытке.

---

### User Story 4 - Сохранение доверия к существующим импортам (Priority: P4)

Учитель продолжает загружать все ранее поддержанные PDF. Расширение layout recognition не меняет
их структуру, coverage, правильные ответы или public lesson rendering.

**Why this priority**: Универсальность не должна достигаться ценой регрессий в уже принятом
reproduce pipeline.

**Independent Test**: Прогнать все существующие golden fixtures feature 001 и получить те же
version-pinned результаты и нулевое число unsupported additions.

**Acceptance Scenarios**:

1. **Given** любой прежний golden PDF, **When** он проходит новый pipeline, **Then** его ожидаемые
   группы, задания, SourceRef и coverage не меняются без отдельной versioned baseline migration.
2. **Given** model classification неоднозначна, **When** confidence ниже активного порога или
   proposals конфликтуют, **Then** система создаёт blocking review issues и не выбирает структуру
   через fixture-specific recognizer.
3. **Given** один и тот же материал импортирован как PDF и pasted text, **When** оба source adapter
   создали canonical `DocumentIR`, **Then** structural output использует одинаковые roles,
   interaction kinds, validation gates и coverage semantics.

### Edge Cases

- Нумерация начинается не с 1, имеет пропуск, перезапускается внутри новой секции или использует 0
  только для примера.
- Prompt, option list или shared bank продолжаются на следующей странице.
- Буквы A–F встречаются в обычном тексте и не являются банком вариантов.
- Вопрос содержит четыре варианта, но один option перенесён на несколько визуальных строк.
- Header или footer немного меняется из-за номера страницы.
- Документ содержит и поддержанные, и неизвестные interaction patterns.
- Один и тот же text item геометрически близок к двум кандидатам.
- В документе есть candidates, но после исключения примеров не остаётся оцениваемых упражнений.
- Заголовки, инструкции и тексты даны на китайском или другом ранее не встречавшемся языке.
- Модель возвращает неизвестный block ID, пересекающиеся exercise boundaries, пропущенный исходный
  block, упражнение без answer field или текст, которого нет в `DocumentIR`.
- Один group, prompt, shared bank или reference block продолжается через границу model batch/page.
- Один block содержит instruction и несколько независимо отвечаемых items; instruction span
  заканчивается до первого item, а item spans не пересекаются.
- Несколько предложений образуют один диалог или общий response field и поэтому остаются одним
  Exercise; пунктуация сама по себе не является границей.
- PDF содержит больше 5 страниц или pasted text превышает установленный лимит символов.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Система MUST отделять чтение text layer и восстановление строк от классификации типов
  упражнений.
- **FR-002**: Система MUST сохранять для каждого reconstructed line исходные text items, страницу,
  координаты, порядок и доступные типографические признаки.
- **FR-003**: Модель MUST предлагать роль `boilerplate`; deterministic validator MAY подтверждать
  её повторяющейся geometry/text evidence, но MUST NOT самостоятельно создавать семантические
  regions. Подтверждённый boilerplate исключается из prompts/options и сохраняется как явный
  non-student coverage outcome.
- **FR-004**: После подготовки `DocumentIR` система MUST передавать модели адресуемые reconstructed
  blocks с текстом, page/order/geometry/style evidence и просить модель предложить semantic regions
  и связи без опоры на точные fixture-specific заголовки.
- **FR-005**: Система MUST поддерживать локально последовательную source numbering с произвольного
  положительного значения и хранить source ordinal отдельно от UI ordinal.
- **FR-006**: Модель MUST предлагать границы multi-line и cross-page groups/exercises/prompts по
  ссылкам на существующие block IDs; application code MUST собирать текст только из указанных
  `DocumentIR` spans и MUST NOT принимать свободно сгенерированный source text.
- **FR-007**: Модель MUST предлагать связи local options/shared banks с упражнениями; порядок,
  отображаемый текст, stable IDs и SourceRef MUST детерминированно выводиться из исходных blocks.
- **FR-008**: Типизированная model classification MUST различать как минимум section heading,
  instruction, reference material, example, exercise prompt, gap segment, local option, shared
  matching/word-bank entry, answer key, boilerplate и unknown, а также interaction kinds matching,
  single choice, bracket gap, word-bank gap и unknown.
- **FR-009**: Matching MUST быть представлен самостоятельным `matching` interaction kind в новой
  версии canonical LessonSpec contract; композиция существующих gap/single-choice primitives MUST
  NOT использоваться как canonical matching representation.
- **FR-010**: Matching answer MUST использовать stable ID выбранного shared entry как каноническое
  значение; буквенный source label MUST храниться отдельно для отображения и provenance и MUST NOT
  использоваться как identity ответа.
- **FR-011**: Matching group MUST хранить один ordered shared bank с usage policy `useOnce`; entries
  MUST NOT копироваться в локальные options каждого item.
- **FR-012**: Example item MUST учитываться в coverage через явный non-student outcome и MUST NOT
  попадать в число оцениваемых упражнений.
- **FR-013**: Модель MUST предлагать exercise candidates и их границы только после immutable
  `DocumentIR`; отсутствие предложенных candidates MUST NOT считаться отсутствием исходного
  содержимого.
- **FR-014**: Каждый значимый `DocumentIR` block MUST иметь один или несколько явно разрешённых
  typed usages и ровно один coverage outcome: exercise component, reference/example, answer key,
  boilerplate, teacher exclusion или machine-readable issue.
- **FR-015**: При наличии значимых `DocumentIR` blocks и отсутствии валидных model-proposed groups
  система MUST открыть отдельный teacher-review fallback с source preview и всеми unknown regions;
  учитель MUST иметь
  возможность выбрать для каждого candidate поддерживаемый interaction kind и отредактировать
  обязательные структурные поля либо назначить outcome `reference`, `example` или
  `teacher exclusion`. Каждое решение MUST сохранять SourceRef, teacher-decision provenance и
  coverage accounting; canonical lesson draft MUST NOT создаваться до появления хотя бы одной
  валидной group и полного coverage accounting.
- **FR-016**: Система MUST NOT передавать пустой список groups в canonical draft validation.
- **FR-017**: Ошибки unsupported layout MUST показываться учителю понятным сообщением без raw schema
  payload, stack trace или внутренних имён полей.
- **FR-018**: Модель MUST иметь bounded responsibility за structural proposal: semantic regions,
  candidates, groups, exercise boundaries, interaction kind, gaps и option/shared-bank relations.
  Она MAY отдельно предлагать ответы, но MUST NOT подтверждать ответы, вычислять итоговый coverage,
  изменять source text, выполнять persistence/routing или публиковать урок.
- **FR-019**: При отсутствии answer key все answer fields MUST оставаться reviewable и блокировать
  публикацию до teacher verification.
- **FR-020**: Все prompts, shared entries, options и answer fields MUST иметь валидные SourceRef либо
  явное teacher-decision provenance.
- **FR-021**: Contract evolution MUST сохранять чтение опубликованных LessonSpec предыдущих версий и
  MUST отклонять несовместимую запись без новой версии.
- **FR-022**: Существующие golden fixtures MUST оставаться version-pinned regression gates с нулём
  unsupported additions.
- **FR-023**: `vocab.pdf` и `placement_test.pdf` MUST стать immutable acceptance fixtures этой
  feature с human-labeled expected manifests.
- **FR-024**: Teacher review, publication, student-safe projection, accessibility, security,
  durability и observability MUST переиспользовать существующие feature 001 capabilities.
- **FR-025**: `singleChoice` с ровно одним каноническим пропуском `___` и одним choice response
  field MUST показывать select непосредственно в позиции пропуска и в teacher preview, и на
  student page. Второй раскрытый список вариантов под prompt MUST отсутствовать; редактирование
  option values MAY находиться в свёрнутом редакторе. Для zero-gap и multi-gap сохраняется обычный
  renderer.
- **FR-026**: Для сохранённого draft с unresolved answer fields teacher review MUST показывать
  явное действие `Предложить ответы с ИИ`. Полученные ответы MUST сохраняться как `modelInferred`,
  MUST NOT автоматически подтверждаться или закрывать blocking issues, а ошибка provider MUST
  оставлять ручное редактирование полностью доступным и показывать понятное сообщение.
- **FR-027**: Горизонтальная линия, нарисованная в question region PDF и выровненная с текстовой
  строкой, MUST преобразовываться в один канонический маркер `___` до exercise assembly. Правило
  MUST поддерживать пропуск в начале, середине и конце строки, на перенесённой строке и перед знаком
  пунктуации; оно MUST опираться на PDF geometry/vector evidence, а не на языковую догадку.
- **FR-028**: Persisted DocumentIR cache MUST быть привязан к явной версии parser. Повторный импорт
  дедуплицированного source MUST переиспользовать только IR текущей parser version; legacy IR MUST
  сохраняться для provenance, но MUST NOT использоваться для нового draft.
- **FR-029**: Structural model output MUST иметь versioned strict schema с model/prompt/input/output
  versions и содержать только существующие block/span IDs, typed roles, relations, confidence и
  краткое evidence; неизвестные поля и ссылки MUST отклоняться.
- **FR-030**: Детерминированный validator MUST отклонять пропущенные значимые blocks, запрещённое
  overlapping ownership, invented text, dangling relations, duplicate IDs, invalid ordering,
  несовместимый interaction shape и любое оцениваемое exercise без минимум одного answer field.
- **FR-031**: Invalid, incomplete, timed-out, rate-limited, 401/402 или schema-incompatible model
  output MUST NOT попадать в canonical draft; исходный `DocumentIR` MUST сохраняться и импорт MUST
  переходить в recoverable teacher-review со всеми неклассифицированными значимыми blocks.
  Deterministic или fixture-specific automatic fallback, создающий draft, MUST NOT запускаться.
- **FR-032**: Structural classification и answer suggestion MUST быть разными model calls с
  независимыми versioned contracts, telemetry, retry budgets и failure paths.
- **FR-033**: Production classification/routing MUST NOT содержать exact-match recognizers,
  названные по fixture, учебнику, конкретному заголовку или тексту упражнения. Детерминированные
  правила MAY выполнять только language-agnostic normalization, geometry reconstruction, security
  validation и contract invariants.
- **FR-034**: Structural classification MUST принимать Unicode content и одинаковый typed output
  независимо от языка источника; неизвестный язык MUST снижать confidence или вести к review, но
  MUST NOT создавать пустые `answerFields` либо raw schema error.
- **FR-035**: Система MUST отклонять до построения `DocumentIR` и запуска model calls PDF длиннее
  5 страниц и pasted text длиннее 30 000 Unicode-символов после нормализации переносов строк,
  включая пробелы, показывая понятный validation message.
- **FR-036**: Допустимый `DocumentIR` MUST классифицироваться bounded overlapping windows по
  стабильным block IDs. Детерминированный reconciliation MUST объединять cross-window/page groups,
  удалять только идентичные overlap proposals и повторно применять требования FR-029–FR-030 ко
  всему объединённому результату до создания draft.
- **FR-037**: Полностью валидная reconciled structure MAY автоматически создавать редактируемый
  draft. Любой `unknown`, validator conflict или structural element ниже versioned confidence
  threshold MUST создавать адресуемую review issue и блокировать публикацию до teacher decision;
  система MUST NOT требовать отдельного подтверждения каждого high-confidence structural element.
  Structural review MUST NOT заменять независимое подтверждение правильных ответов.
- **FR-038**: PDF и pasted text MUST использовать общий canonical `DocumentIR` boundary и один
  versioned structural-classification contract. Source adapters MAY различаться только подготовкой
  исходных blocks и metadata; typed roles, reconciliation, validation, review issues и draft
  assembly MUST иметь одинаковую семантику для обоих source kinds.
- **FR-039**: Structural model manifests, proposals, reconciled artifacts и teacher decisions MUST
  наследовать бессрочную `retainForProvenance` policy feature 001, не иметь TTL/delete API и
  сохранять restrictive source lineage. Каждый run MUST записывать provider-reported token usage и
  cost либо явный `costUnavailable` без source text, answers, URLs или credentials. Model-call,
  window и reconciliation manifests MUST быть отдельными versioned typed objects; итоговые window,
  attempt, latency, outcome, conflict и coverage aggregates MUST детерминированно вычисляться из них
  и отклоняться при несовпадении lineage или счётчиков.
- **FR-040**: Source blocks и embedded instructions MUST считаться untrusted data. Structural prompt
  и deterministic validator MUST запрещать источнику изменять задачу классификации, output schema,
  system constraints или publication behavior; adversarial prompt-injection content MUST оставаться
  классифицируемым source text и не выполнять инструкции.
- **FR-041**: Каждый независимо отвечаемый source item MUST соответствовать ровно одному
  `Exercise`. Его prompt MUST содержать только принадлежащие item source spans и необходимый
  внутрипунктовый контекст; соседние items, group instruction, reference material, examples и shared
  banks MUST NOT включаться. Несколько items внутри одного block MUST использовать
  непересекающиеся character spans. Deterministic validator MUST создавать blocking
  `NON_ATOMIC_EXERCISE` при пересечении prompts и `MIXED_INSTRUCTION_AND_ITEMS` при пересечении
  instruction/prompt либо неверной semantic role; неоднозначность MUST переходить в teacher review,
  а не разрешаться punctuation- или language-specific хардкодом.
- **FR-042**: До optional answer-suggestion model calls система MUST бесплатно вычислять immutable
  preflight с plan hash, answer-field и physical-batch counts, оценкой tokens/cost и server hard
  limit. Large plans MUST требовать отдельного teacher confirmation точного plan hash; превышение
  hard limit MUST блокировать вызовы. Batches MUST плотно упаковывать независимые целые группы в
  bounded request, сохранять completed result/telemetry owner-scoped до следующего вызова и MUST NOT
  повторно оплачивать completed batch того же run, draft revision, plan и batch hash. Все платные answer suggestions MUST запускаться только учителем через этот checkpointed endpoint; automatic ingestion MUST создавать ноль paid answer-suggestion calls. `planHash` MUST включать revision, exact batch payload digests, model, prompt/input/output и pricing-policy versions. Checkpoints наследуют `retainForProvenance` бессрочно без TTL/delete API.
- **FR-043**: Unknown-layout review MUST предлагать все teacher-safe outcomes: `singleChoice`, `wordOrder`, `bracketGap`, `oddOneOut`, `inlineGap`, `shortText`, `reference`, `example` и explicit exclusion. Optional AI classification MUST сначала вернуть zero-call preflight с candidate/request counts, token estimate, RUB estimate и hard limit, затем требовать подтверждение exact plan hash. AI result MUST оставаться editable suggestion и MUST NOT сохранять teacher decisions автоматически. Completed classification plan MUST переиспользоваться без повторной оплаты. Типы, требующие обязательного shared resource или source-derived asset (`wordBankGap`, `matching`, `imageChoice`), MUST NOT предлагаться этим упрощённым действием без отдельного редактора связанных данных.
- **FR-044**: Structural classification MUST независимо определять `interactionKind`,
  `presentationKind` и optional `stimulusKind`; таблица, диалог, изображение или listening context
  MUST NOT подменять тип ответа.
- **FR-045**: `wordOrder` и `matching` MUST отображаться как keyboard-accessible drag-and-drop в
  teacher preview и student lesson. Matching MUST использовать один общий `matchingBank`, stable
  entry IDs и `useOnce`; локальные копии вариантов запрещены.
- **FR-046**: Система MUST поддерживать `shortText` для одной строки свободного ввода,
  `imageChoice` для выбора изображения и image-backed entries в `matchingBank`. Каждый image region
  MUST иметь SourceRef, crop/asset lineage и безопасный alt-text; отсутствие достоверного asset
  блокирует публикацию соответствующего упражнения.
- **FR-047**: Listening без прикреплённого audio asset MUST публиковаться только как
  `teacherLedExternalAudio` stimulus с видимыми вариантами ответа и явной пометкой, что аудио
  воспроизводит учитель. Автоматически выдумывать transcript или audio URL запрещено.
- **FR-048**: Для mixed-layout workbook одна независимо отвечаемая строка/пункт MUST создавать один
  Exercise; instruction, соседняя группа, таблица, page footer и reading reference MUST NOT
  присоединяться к последнему пункту предыдущей группы.
- **FR-049**: Для image region ниже confidence threshold teacher review MUST показывать PDF и
  предложенную системой неизменяемую crop-рамку в одной координатной системе. Учитель MAY только
  подтвердить или отклонить рамку; UI/API MUST NOT позволять перемещение, resize или ручное создание
  рамок. Решение MUST сохранять исходный SourceRef, detector coordinates, actor/revision и
  teacher-decision provenance. Отклонённая обязательная карточка MUST оставить упражнение
  unsupported и блокировать публикацию, пока учитель явно не исключит всё упражнение с coverage
  outcome.
- **FR-050**: Published derived image MUST отдаваться анонимному ученику только через application
  media endpoint, адресованный `publicLessonId`, immutable lesson version и opaque asset ID.
  Endpoint MUST проверять, что asset входит именно в эту опубликованную версию, не раскрывать
  Storage object path/source signed URL, поддерживать conditional GET и immutable cache headers и
  возвращать одинаковый public-safe not-found для чужого, неопубликованного или отсутствующего
  asset.
- **FR-051**: Система MUST назначать image option нейтральное доступное имя вида `Изображение X`,
  где `X` — стабильная display label. Она MUST NOT вызывать vision-модель, генерировать описание
  содержимого или выводить правильность варианта из изображения. Нейтральная подпись MUST быть
  одинаковой в teacher preview, student UI и результатах проверки. Image-only format MUST оставаться
  release-blocked, пока accessibility validation не подтвердит приемлемый non-visual fallback либо
  продукт не введёт отдельное требование содержательного описания.
- **FR-052**: `displayLabel` image option MUST сохранять исходную source label, когда она явно
  связана с visual region. При отсутствии label система MUST детерминированно назначать A/B/C по
  versioned visual reading order. Teacher review MAY менять display order/labels до публикации, но
  MUST NOT менять stable option/asset IDs; accepted answer MUST ссылаться на stable option ID, а не
  на display label.

### Key Entities

- **Reconstructed Line**: Упорядоченная строка, восстановленная из одного или нескольких text items,
  с page geometry и обратной связью к исходным items.
- **Layout Region**: Адресуемая область страницы, классифицированная как heading, instruction,
  question, option bank, example, boilerplate, reference или unknown.
- **Exercise Candidate**: Сегмент до окончательной interaction classification; имеет source ordinal,
  region refs, confidence evidence и ровно один coverage outcome.
- **Matching Group**: Группа левых items и одного shared bank, использующая group-level usage policy.
- **Shared Matching Entry**: Lettered source option с stable ID, source label, display text, ordinal и
  SourceRef.
- **Unsupported Layout State**: Пользовательское blocking-состояние, которое сохраняет source/IR,
  coverage evidence и понятную recovery guidance без невалидного draft.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `vocab.pdf` даёт ровно 1 matching group, 5 student items, 6 shared entries A–F и 1
  отдельно учтённый example item 0.
- **SC-002**: В `vocab.pdf` shared bank отображается ровно один раз, а число локальных option copies
  во всех пяти items равно нулю.
- **SC-003**: `placement_test.pdf` даёт ровно 50 single-choice items с source ordinals 21–70 и ровно
  4 ordered options у каждого item.
- **SC-004**: Grammar/Vocabulary boundary сохраняется, а число boilerplate fragments внутри prompts
  и options `placement_test.pdf` равно нулю.
- **SC-005**: 100% prompts, options, shared entries и answer fields новых acceptance fixtures имеют
  валидный SourceRef или документированное teacher-decision provenance.
- **SC-006**: 100% допустимых PDF с читаемым text layer и pasted text завершаются валидным draft
  либо определённым unsupported-layout state; raw schema errors отсутствуют.
- **SC-007**: 100% unclassified candidates имеют blocking issue или явное teacher decision; coverage
  никогда не сообщает `passed` при потерянном candidate.
- **SC-008**: Все golden fixtures feature 001 сохраняют прежние counts, contract compatibility и
  нулевое число unsupported additions.
- **SC-009**: В 100% acceptance browser journeys учитель видит source preview, понятный status и
  доступное следующее действие; внутренние validation payloads не отображаются.
- **SC-010**: Ни один неподтверждённый ответ из двух новых fixtures не попадает в опубликованный урок
  или student-safe payload.
- **SC-011**: Валидный импорт получает `runId` не более чем за 2 секунды p95, а полный путь от
  `DocumentIR` через structural classification и deterministic validation для каждого acceptance
  source завершается быстрее 60 секунд p95 в зафиксированной eval-среде.
- **SC-012**: В teacher и student browser tests 100% single-choice items с одним `___` показывают
  ровно один inline select в позиции пропуска и ноль раскрытых списков вариантов под prompt.
- **SC-013**: Teacher-triggered AI request либо сохраняет reviewable `modelInferred` suggestions с
  обязательным подтверждением, либо оставляет draft неизменным и ручную проверку доступной.
- **SC-014**: Model-based импорт `placement_test.pdf` создаёт ровно 50 prompts 21–70,
  каждый из которых содержит ровно один канонический `___`; teacher и student payload не содержат
  ни одного single-choice prompt без пропуска.
- **SC-015**: При наличии legacy IR без текущей `parserVersion` повторный импорт того же content hash
  создаёт новый IR текущей версии и проходит SC-014; выбор самого старого checkpoint запрещён.
- **SC-016**: В fallback browser/integration journey учитель может для каждого unknown candidate
  выбрать поддерживаемый interaction kind и сохранить валидные обязательные поля либо назначить
  outcome `reference`, `example` или `teacher exclusion`; после reload решения сохраняются, а draft
  создаётся только при наличии валидной group и полном coverage accounting.
- **SC-017**: Golden-набор с китайским reading text, choice questions, shared word bank, sentence
  ordering, true/false и character-entry items создаёт reference block и все ожидаемые exercises
  без fixture-specific code; число опубликованных exercises с пустым `answerFields` равно нулю.
- **SC-018**: Для каждого model-based import 100% значимых `DocumentIR` blocks имеют проверяемый
  coverage outcome, а 100% canonical prompts/options/shared entries являются точной проекцией
  исходных block/span IDs.
- **SC-019**: В adversarial fixture embedded instructions не меняют structural contract и не
  вызывают tool/persistence/publication actions; manifest содержит latency, usage и cost либо
  `costUnavailable`, а sensitive/source content в telemetry равно нулю.
- **SC-020**: В atomicity golden/regression fixtures число независимо отвечаемых source items равно
  числу `Exercise`; пересечение source spans между соседними prompts равно нулю; instruction
  содержит ноль exercise-item spans. Диалог из нескольких предложений с одним response unit
  сохраняется одним Exercise.
- **SC-021**: Импорт с 369 answer fields не вызывает модель автоматически, показывает до списания
  план, число физических запросов, token/cost estimate и hard limit; отмена создаёт ноль model calls.
  После подтверждения повторный запуск использует все completed batch checkpoints и не оплачивает их
  повторно.
- **SC-022**: В unknown-layout browser journey учитель видит девять outcomes, отмена RUB preflight создаёт ноль model calls, подтверждённый запрос возвращает предложения без изменения review revision, а повтор использует completed checkpoint.
- **SC-023**: `workbook_mixed_interactions_3_pages.pdf` сохраняет границы Lesson 1D, Lesson 2A и
  Reading; 1D/1A является choice, 1D/1B — shortText, word-order/matching — drag-and-drop,
  listening — teacher-led options only, а image exercises не публикуются без извлечённых assets.
- **SC-024**: В browser journey учитель видит фиксированную image crop-рамку поверх PDF и может
  только подтвердить или отклонить её. После reload решение и detector coordinates сохраняются;
  подтверждение разрешает derived asset, а отклонение оставляет publish gate закрытым до явного
  исключения соответствующего упражнения.
- **SC-025**: Anonymous browser получает каждый image asset только через public media endpoint;
  правильная lesson/version/asset связь возвращает кешируемое изображение, а чужая версия, asset
  другого владельца и прямой Storage path недоступны и неразличимы по ответу.
- **SC-026**: Создание и публикация image fixture выполняют ноль vision/alt-generation model calls;
  teacher и student payload используют одинаковые нейтральные labels, а accessibility report явно
  фиксирует результат проверки non-visual fallback и блокирует релиз при её провале.
- **SC-027**: Повторная сборка одного visual fixture сохраняет source labels и stable option IDs;
  fixture без labels получает одинаковый version-pinned reading order. Перестановка учителем меняет
  только display order/label и не меняет серверную проверку принятого stable option ID.

## Assumptions

- Первая версия layout-aware extraction валидируется на цифровых PDF с читаемым text layer; OCR
  остаётся отдельной capability.
- Feature расширяет reproduce mode и не добавляет generation-from-free-form-content.
- Существующие auth, ownership, persistence, review, publish и public lesson capabilities остаются
  каноническими и не дублируются.
- Generic pipeline означает versioned model-based segmentation/classification с детерминированными
  fidelity gates, а не обещание автоматически публиковать любой возможный учебный материал.
- Structural classification является обязательным bounded step после `DocumentIR`; answer
  suggestions остаются отдельным optional best-effort enrichment.
- Исходные PDF не исправляются и не нормализуются; derived reconstructed lines не заменяют original
  text items как источник provenance.
