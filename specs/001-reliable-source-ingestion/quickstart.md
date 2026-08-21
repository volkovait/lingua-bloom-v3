# Quickstart Validation Guide

Этот документ описывает проверку feature после реализации. Команды становятся исполняемыми по мере
выполнения `tasks.md`.

## Prerequisites

- Поддерживаемая LTS-версия Node.js
- pnpm
- Локальный Supabase или изолированный test project
- Inngest dev server
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
pnpm eval:golden --fixture 1_page
pnpm eval:golden --fixture raw
```

Expected for `1_page`:

- 5 exercise groups;
- 34 answerable items;
- 0 unsupported additions;
- source reference for every prompt, option and answer field;
- unverified answers block publication.

Expected for `raw`:

- 18 numbered items;
- 29 bracket expressions, including 2 split across line breaks;
- 4 explicit short answers and 33 answer fields in total;
- warning `SOURCE_TRUNCATED` for item 18;
- no generated continuation.

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

## 6. Run the local product

```bash
pnpm dev
```

Sign in as a teacher and upload both fixtures through the shared import form. Verify run creation,
source/draft alignment, option-level provenance, issue navigation, review decisions and publish
blocking. Повторите import с тем же idempotency key: тот же payload должен вернуть прежний run, а
другой payload — `409`.

## 7. Run browser tests

```bash
pnpm test:e2e
```

Expected: upload, review, versioning and anonymous student-safe journeys pass in Chromium, Firefox
and WebKit, including keyboard and mobile projects with isolated state.

## Release Gate

Release is blocked unless all deterministic suites pass, golden counts match exactly, unsupported
addition count is zero, blocking issues prevent publish, tenant isolation passes, public IDs satisfy
the capability contract and student surfaces contain no answer-bearing fields.
