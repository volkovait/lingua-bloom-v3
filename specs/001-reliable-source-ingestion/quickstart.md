# Quickstart Validation Guide

Этот документ описывает проверку feature после реализации. Команды становятся исполняемыми по мере
выполнения `tasks.md`.

## Prerequisites

- Поддерживаемая LTS-версия Node.js
- pnpm
- Локальный Supabase или изолированный test project
- Inngest CLI 1.43.0 (workspace dependency; запускается корневой командой)
- Тестовые browser binaries Playwright

## 1. Install and validate contracts

```bash
pnpm install
pnpm contracts:check
pnpm typecheck
```

Expected: все JSON Schema валидны, runtime contracts совпадают с committed schemas, invalid
`LessonSpec` states отклоняются, baseline fixtures остаются читаемыми, несовместимое изменение без
новой версии отклоняется, published contract не принимает draft-only answer states, а
`StudentLessonSpec` не содержит answer-bearing fields.

## 2. Run deterministic tests

```bash
pnpm test:unit
pnpm test:property
```

Expected: parser invariants, answer normalization и idempotency tests проходят без model calls.

## 3. Run supplied golden fixtures

```bash
pnpm exec vitest run --config vitest.workspace.ts \
  packages/evals/src/fixtures/one-page.eval.test.ts \
  packages/evals/src/fixtures/articles-multipage.eval.test.ts \
  packages/evals/src/fixtures/reading-text-questions.eval.test.ts \
  packages/evals/src/fixtures/raw-text.eval.test.ts
```

Expected for `1_page`:

- 5 exercise groups;
- 34 answerable items;
- 0 unsupported additions;
- source reference for every prompt, option and answer field;
- unverified answers block publication.

Text import (`raw.txt`) is part of the complete feature 001 gate, while the previously accepted PDF
vertical slice remains an independently stable baseline. For `raw.txt` item 17, exactly two answer
fields are extracted (`Do you wear` and `wore`);
`Yes, I ....` remains prompt context. The first accepted value is `Do you wear`: `do you wear`,
`DO YOU WEAR?` and
extra-whitespace variants MUST pass English normalization, while `Did you wear` and changed word
order MUST fail.

## 4. Run workflow resilience tests

```bash
pnpm test:integration
pnpm test:resilience
```

Expected: timeout, duplicate event, worker restart and double resume do not duplicate artifacts or
published versions; временный сбой не запускает автоматический retry, owner-triggered resume
продолжает тот же run с checkpoint, а API различает blocked, failed/retriable и failed/terminal.

## 5. Run security and public-access gates

```bash
pnpm test:security
```

Expected:

- unauthenticated and cross-tenant database/API/Storage access is rejected;
- SourceRepository и API не имеют delete operation, source relations используют `ON DELETE RESTRICT`,
  TTL отсутствует, а источник остаётся доступен для provenance после публикации v2;
- cross-document, wrong-IR и missing-block SourceRef отклоняются до публикации;
- anonymous student API, HTML and browser state contain no accepted answers or answer provenance;
- public lesson IDs are URL-safe, unique and generated with at least 128 bits of CSPRNG entropy;
- after v2 publication the same public ID returns v2; unknown and unpublished IDs return the same
  `404`, and no public listing endpoint exists;
- traces contain no source text, answers, tokens or signed storage URLs.

## 6. Run performance and live-model gates

```bash
pnpm exec vitest run --config vitest.workspace.ts packages/evals/src/performance.eval.test.ts
NODE_USE_SYSTEM_CA=1 RUN_LIVE_OPENAI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.workspace.ts apps/web/src/ai/openai-answer-suggester.live.test.ts
```

Expected: exact input limits and the 1-page parse p95 pass. The pinned live model independently
passes SC-017 for `1_page.pdf` and SC-023 for `reading_text_questions_4_pages.pdf`; reading must
score 7/7 model-eligible fields, while its empty `teacherOnly` ambiguous field is absent from the
request and denominator. Latest live reports are always written, while promotion to
`baseline-report.json` requires `UPDATE_EVAL_BASELINE=1` and both fixture gates passing.

## 7. Run the local product

```bash
pnpm dev
```

Команда одновременно запускает Next.js на `http://localhost:3000` и закреплённый Inngest Dev Server
на `http://localhost:8288`, регистрируя `/api/inngest`. Не запускайте только `dev:web`: без worker
импорт останется `accepted`. Остановка или сбой одного процесса завершает весь local dev lifecycle.

Sign in as a teacher and upload all three release PDF fixtures through the shared import form. This
step is not satisfied by fixture-mode mocks: record a fresh run URL and publication result for each
real upload, including `reading_text_questions_4_pages.pdf`. Verify run creation,
source/draft alignment, option-level provenance, review decisions and publish blocking. После появления
draft review workspace должен показывать только PDF preview и редактор распарсенных заданий: отдельные
списки DocumentIR blocks, reference blocks, validation issues и workflow events отсутствуют. Для группы 5 отдельно проверьте: один блок из 7 слов расположен между инструкцией и
предложениями, показан ровно один раз, все 7 пунктов ссылаются на него и не содержат локальных копий
банка в options. Повторите import с тем же idempotency key: тот же payload должен вернуть прежний run, а
другой payload — `409`. Для `articles_4_pages.pdf` проверьте ровно 11 групп (одна partial), 36 items, 369 answer fields и 6 справочных блоков; тексты справочных строк должны совпадать с PDF text layer без нормализации. Убедитесь, что упражнение 56 объединяет страницы 3 и 4, а add/delete в review создают teacher ReviewDecision и сохраняются после reload.
Для `reading_text_questions_4_pages.pdf` проверьте 2 неизменённых reading reference blocks, 4 связанных
gap-вопроса exercise 5 и 4 A/B-вопроса exercise 6. Обе группы должны быть complete; вопросы exercise 6
должны иметь lineage к тексту про Ginny на следующей странице и не создавать `SOURCE_TRUNCATED`.
Примеры с номером 0 не должны становиться заданиями.

Then paste `tests/fixtures/sources/raw.txt` through the same form. Verify 18 exercises and 29 answer
fields, exactly two fields for item 17, unchanged dialogue ellipses, inline issue highlighting,
teacher add/edit/delete persistence after reload and resolution of the item 18 `SOURCE_TRUNCATED`
issue after the teacher completes its prompt. Publish the reviewed lesson, open the stable public URL
without a teacher session and record both the run URL and public lesson ID in `validation-report.md`.

## 8. Run browser tests

```bash
pnpm test:e2e
```

Expected: upload, review, versioning and anonymous student-safe journeys pass in Chromium, Firefox
and WebKit, including keyboard and mobile projects with isolated state.

## Release Gate

Release is blocked unless all deterministic suites for PDF and text pass, golden counts match
exactly, unsupported addition count is zero, blocking issues prevent publish, tenant isolation
passes, public IDs satisfy the capability contract and student surfaces contain no answer-bearing
fields. The real PDF and text browser journeys and final `$speckit-analyze` must also pass.
