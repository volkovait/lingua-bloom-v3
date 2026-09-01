# Data Model: Student Attempt Grading and Telegram Results

## StudentAttempt

| Field | Type | Invariant |
|---|---|---|
| `id` | uuid | Client-generated attempt/idempotency identifier |
| `lesson_id` | uuid FK | Derived from public lesson; never client owner input |
| `lesson_version_id` | uuid FK | Immutable version used for grading |
| `owner_id` | uuid FK | Derived through lesson/version relation |
| `public_lesson_id` | text snapshot | URL-safe ID used for submission |
| `lesson_version` | integer | Must match referenced immutable version |
| `student_display_name` | text | Required if clarification default is confirmed; max 120 |
| `request_fingerprint` | text | Hash of canonical version/name/responses payload |
| `grader_version` | text | Explicit version, initially `1.0.0` |
| `correct_count` | integer | Server computed, 0..total_count |
| `total_count` | integer | Number of expected answer fields, 1..500 |
| `created_at` | timestamptz | Server timestamp |

Unique `(lesson_id, id)` permits identical replay and rejects a conflicting fingerprint.

## StudentAttemptResponse

| Field | Type | Invariant |
|---|---|---|
| `attempt_id` | uuid FK | Immutable relation to the retained attempt |
| `exercise_id` | text | Must belong to selected LessonSpec version |
| `answer_field_id` | text | Unique within attempt and expected by LessonSpec |
| `response_kind` | text | Versioned enum from student/internal contracts |
| `submitted_value` | jsonb | Strict kind-specific value and size limits |
| `is_correct` | boolean | Computed server-side |
| `accepted_display_values` | jsonb | Empty for correct fields; safe reveal for incorrect fields |
| `ordinal` | integer | Canonical document-order result position |

Primary key `(attempt_id, answer_field_id)`. The browser never supplies `is_correct` or accepted
values.

## TeacherTelegramSettings

| Field | Type | Invariant |
|---|---|---|
| `owner_id` | uuid PK/FK | Authenticated teacher |
| `enabled` | boolean | Notification opt-in |
| `chat_id` | text | Validated bounded Telegram destination |
| `token_ciphertext` | bytea | AES-GCM ciphertext only |
| `token_nonce` | bytea | Unique nonce per encryption |
| `encryption_key_version` | text | Selects server-side key |
| `bot_username` | text nullable | Sanitized `getMe` metadata |
| `created_at`, `updated_at` | timestamptz | Server timestamps |

No browser-readable policy exposes encryption columns. Safe API view contains `enabled`, `chatId`,
`tokenConfigured`, optional `botUsername`, `updatedAt`.

## TelegramDeliveryOutbox

| Field | Type | Invariant |
|---|---|---|
| `id` | uuid | Server generated |
| `attempt_id` | uuid unique FK | At most one delivery record per attempt |
| `owner_id` | uuid FK | Must match attempt owner |
| `status` | enum | `pending`, `sending`, `sent`, `skipped`, `failed` |
| `claim_token` | uuid nullable | Atomic single worker claim |
| `provider_message_id` | text nullable | Set only on confirmed success |
| `failure_category` | text nullable | Sanitized enum, no provider body |
| `created_at`, `claimed_at`, `completed_at` | timestamptz | Lifecycle timestamps |

## Relationships and deletion

```text
lessons 1 ── * lesson_versions
  │                │
  └──── 1 ── * student_attempts
                    ├── * student_attempt_responses
                    └── 1 telegram_delivery_outbox

auth.users 1 ── 0..1 teacher_telegram_settings
```

- Published lessons and versions remain immutable and retained.
- Attempts and their response/delivery rows are immutable and retained indefinitely; this feature exposes no cleanup or deletion operation.
- Teacher settings follow account lifecycle and are not readable by anonymous or cross-tenant users.
