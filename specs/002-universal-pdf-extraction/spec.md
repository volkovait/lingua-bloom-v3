# Feature Specification: Universal PDF Extraction

**Feature Branch**: `002-universal-pdf-extraction`

**Created**: 2026-08-27

**Status**: In progress — clarification complete; foundation and remaining stories pending

**Input**: Two valid PDFs with readable text layers (`vocab.pdf` and `placement_test.pdf`) expose
fixture-specific extraction and an unhandled empty-group validation error. Build a layout-aware,
coverage-safe extraction capability without weakening the fidelity guarantees of feature 001.

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
2. **Given** новая generic classification неоднозначна, **When** существует более точный
   совместимый распознаватель, **Then** система выбирает один детерминированный результат и не
   дублирует candidates между группами.

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

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Система MUST отделять чтение text layer и восстановление строк от классификации типов
  упражнений.
- **FR-002**: Система MUST сохранять для каждого reconstructed line исходные text items, страницу,
  координаты, порядок и доступные типографические признаки.
- **FR-003**: Система MUST обнаруживать статистически повторяющийся page boilerplate и исключать его
  из exercise prompts/options, сохраняя его учёт как неоцениваемого содержимого.
- **FR-004**: Система MUST находить section/group headings по совокупности положения, типографики и
  расширяемого instruction lexicon, а не по одному точному заголовку.
- **FR-005**: Система MUST поддерживать локально последовательную source numbering с произвольного
  положительного значения и хранить source ordinal отдельно от UI ordinal.
- **FR-006**: Система MUST собирать multi-line question candidate до следующего совместимого номера,
  heading или доказанной границы options.
- **FR-007**: Система MUST связывать последовательные lettered options с ближайшим совместимым
  question candidate, сохраняя порядок и SourceRef каждого option.
- **FR-008**: Система MUST классифицировать как минимум matching, single choice, bracket gap,
  word-bank gap и unknown, не выводя interaction kind только из ordinal группы.
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
- **FR-013**: Система MUST обнаруживать candidates до interaction classification, чтобы unknown
  layout не превращался в ложное отсутствие содержимого.
- **FR-014**: Каждый candidate MUST иметь ровно один outcome: exercise, reference/example,
  teacher exclusion или machine-readable issue.
- **FR-015**: При `detectedCandidateCount > 0` и отсутствии валидных groups система MUST открыть
  отдельный teacher-review fallback с source preview и всеми unknown candidates; учитель MUST иметь
  возможность выбрать для каждого candidate поддерживаемый interaction kind и отредактировать
  обязательные структурные поля либо назначить outcome `reference`, `example` или
  `teacher exclusion`. Каждое решение MUST сохранять SourceRef, teacher-decision provenance и
  coverage accounting; canonical lesson draft MUST NOT создаваться до появления хотя бы одной
  валидной group и полного coverage accounting.
- **FR-016**: Система MUST NOT передавать пустой список groups в canonical draft validation.
- **FR-017**: Ошибки unsupported layout MUST показываться учителю понятным сообщением без raw schema
  payload, stack trace или внутренних имён полей.
- **FR-018**: Модель MAY классифицировать только неоднозначные уже обнаруженные candidates и MAY
  предлагать ответы; она MUST NOT определять coverage, создавать новые candidates, подтверждать
  ответы или публиковать урок.
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
- **SC-006**: 100% PDF с читаемым text layer и detected candidates завершаются валидным draft либо
  определённым unsupported-layout state; raw schema errors отсутствуют.
- **SC-007**: 100% unclassified candidates имеют blocking issue или явное teacher decision; coverage
  никогда не сообщает `passed` при потерянном candidate.
- **SC-008**: Все golden fixtures feature 001 сохраняют прежние counts, contract compatibility и
  нулевое число unsupported additions.
- **SC-009**: В 100% acceptance browser journeys учитель видит source preview, понятный status и
  доступное следующее действие; внутренние validation payloads не отображаются.
- **SC-010**: Ни один неподтверждённый ответ из двух новых fixtures не попадает в опубликованный урок
  или student-safe payload.
- **SC-011**: Валидный импорт получает `runId` не более чем за 2 секунды p95, а deterministic parse
  каждого нового acceptance PDF завершается быстрее 60 секунд p95 в зафиксированной eval-среде.
- **SC-012**: В teacher и student browser tests 100% single-choice items с одним `___` показывают
  ровно один inline select в позиции пропуска и ноль раскрытых списков вариантов под prompt.
- **SC-013**: Teacher-triggered AI request либо сохраняет reviewable `modelInferred` suggestions с
  обязательным подтверждением, либо оставляет draft неизменным и ручную проверку доступной.
- **SC-014**: Детерминированный импорт `placement_test.pdf` создаёт ровно 50 prompts 21–70,
  каждый из которых содержит ровно один канонический `___`; teacher и student payload не содержат
  ни одного single-choice prompt без пропуска.
- **SC-015**: При наличии legacy IR без текущей `parserVersion` повторный импорт того же content hash
  создаёт новый IR текущей версии и проходит SC-014; выбор самого старого checkpoint запрещён.
- **SC-016**: В fallback browser/integration journey учитель может для каждого unknown candidate
  выбрать поддерживаемый interaction kind и сохранить валидные обязательные поля либо назначить
  outcome `reference`, `example` или `teacher exclusion`; после reload решения сохраняются, а draft
  создаётся только при наличии валидной group и полном coverage accounting.

## Assumptions

- Первая версия layout-aware extraction валидируется на цифровых PDF с читаемым text layer; OCR
  остаётся отдельной capability.
- Feature расширяет reproduce mode и не добавляет generation-from-free-form-content.
- Существующие auth, ownership, persistence, review, publish и public lesson capabilities остаются
  каноническими и не дублируются.
- Generic pipeline означает расширяемую segmentation/classification architecture, а не обещание
  автоматически распознать любой возможный учебный PDF в первой версии.
- Answer suggestions остаются optional best-effort enrichment после deterministic segmentation.
- Исходные PDF не исправляются и не нормализуются; derived reconstructed lines не заменяют original
  text items как источник provenance.
