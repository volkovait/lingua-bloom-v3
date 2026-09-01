# Research: Student Attempt Grading and Telegram Results

## Decisions

### Grade only on the server

**Decision**: Accept only identity, version, field IDs and submitted values. Resolve score,
correctness and safe answer reveal from the immutable internal LessonSpec.

**Rationale**: The v2 endpoint accepts `score`, `ok` and `correctLine` from the browser, so a caller
can forge both grading and Telegram content. Server grading preserves the answer-key boundary and
makes notifications auditable.

### Bind attempts to the version loaded by the student

**Decision**: Submit the public lesson's displayed integer version and resolve that exact immutable
lesson version under the same public lesson ID.

**Rationale**: Publishing a new version while a page is open must not change field membership or
answers during submission.

### Persist grading before optional notification

**Decision**: Atomically persist attempt, field results and one outbox record, return grading, then
dispatch Telegram independently.

**Rationale**: Telegram is an optional side effect. Synchronous delivery would turn a provider
outage into a broken student test.

### Encrypt per-teacher Bot Tokens

**Decision**: Store an AES-256-GCM envelope with key version; return only `tokenConfigured`.

**Rationale**: Server-only RLS reduces exposure but does not protect database backups or privileged
reads. Bot Tokens are credentials and warrant application-level encryption.

### Use deterministic adapter-based grading

**Decision**: Registry keyed by grader version and response/interaction kind. Reuse the existing
versioned English answer normalizer only for applicable text fields.

**Rationale**: A universal loose string comparator creates false positives and does not scale to
other subjects or matching/ordered interactions.

### Prefer at-most-once Telegram delivery

**Decision**: Unique outbox record and atomic claim; no automatic resend after an ambiguous network
outcome.

**Rationale**: Telegram Bot API provides no application idempotency key. Retrying an uncertain send
can duplicate student results in the teacher's chat.

## Alternatives rejected

- Client-side grading with answer keys embedded in JavaScript: rejected due answer leakage and easy
  tampering.
- Client-computed result rows sent to the server: rejected because notifications become forgeable.
- Global Telegram credentials: rejected because results must route per owner and tenant.
- Plaintext Bot Token protected only by RLS: rejected because credentials remain exposed to database
  backups and privileged queries.
- Model-based grading: rejected because deterministic verified answers already exist and grading is a
  constitutionally deterministic boundary.
- Blocking attempt response on Telegram: rejected because an optional integration must not break the
  student journey.
- Time-limited attempt retention: rejected because the teacher explicitly requires indefinite history. Compensating controls are strict access isolation and redacted observability.
