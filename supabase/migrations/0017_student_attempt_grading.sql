-- Immutable anonymous attempts, encrypted per-teacher Telegram settings and at-most-once outbox.

create table if not exists public.student_attempts (
  id uuid primary key,
  lesson_id uuid not null,
  lesson_version_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  public_lesson_id text not null,
  lesson_version integer not null check (lesson_version > 0),
  student_display_name text not null check (char_length(student_display_name) between 1 and 120),
  request_fingerprint text not null,
  grader_version text not null,
  correct_count integer not null check (correct_count >= 0),
  total_count integer not null check (total_count between 1 and 500 and correct_count <= total_count),
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint student_attempts_lesson_owner_fkey foreign key (lesson_id, owner_id)
    references public.lessons(id, owner_id) on delete restrict,
  constraint student_attempts_version_fkey foreign key (lesson_version_id)
    references public.lesson_versions(id) on delete restrict
);

create table if not exists public.student_attempt_responses (
  attempt_id uuid not null references public.student_attempts(id) on delete restrict,
  exercise_id text not null,
  answer_field_id text not null,
  response_kind text not null check (response_kind in ('text','choice','orderedTokens')),
  submitted_value jsonb not null,
  is_correct boolean not null,
  accepted_display_values jsonb not null default '[]'::jsonb,
  ordinal integer not null check (ordinal > 0),
  primary key (attempt_id, answer_field_id)
);

create table if not exists public.teacher_telegram_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  chat_id text not null check (char_length(chat_id) between 1 and 128),
  token_ciphertext text not null,
  token_nonce text not null,
  token_auth_tag text not null,
  encryption_key_version text not null,
  bot_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.student_attempts(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','sending','sent','skipped','failed')),
  claim_token uuid,
  provider_message_id text,
  failure_category text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.student_attempt_rate_limits (
  identity_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (identity_hash, bucket_start)
);

alter table public.student_attempt_rate_limits enable row level security;

alter table public.student_attempts enable row level security;
alter table public.student_attempt_responses enable row level security;
alter table public.teacher_telegram_settings enable row level security;
alter table public.telegram_delivery_outbox enable row level security;

create or replace function public.prevent_student_attempt_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'STUDENT_ATTEMPT_IMMUTABLE';
end;
$$;

drop trigger if exists student_attempts_immutable on public.student_attempts;
create trigger student_attempts_immutable before update or delete on public.student_attempts
for each row execute function public.prevent_student_attempt_mutation();
drop trigger if exists student_attempt_responses_immutable on public.student_attempt_responses;
create trigger student_attempt_responses_immutable before update or delete on public.student_attempt_responses
for each row execute function public.prevent_student_attempt_mutation();

create or replace function public.submit_student_attempt(
  p_attempt_id uuid,
  p_public_lesson_id text,
  p_lesson_version integer,
  p_student_display_name text,
  p_request_fingerprint text,
  p_grader_version text,
  p_result_payload jsonb,
  p_response_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons%rowtype;
  v_version public.lesson_versions%rowtype;
  v_existing public.student_attempts%rowtype;
  v_field_count integer;
begin
  if char_length(trim(p_student_display_name)) not between 1 and 120 then
    raise exception 'INVALID_STUDENT_NAME';
  end if;
  if jsonb_typeof(p_result_payload) <> 'object' or jsonb_typeof(p_response_rows) <> 'array' then
    raise exception 'INVALID_ATTEMPT_PAYLOAD';
  end if;
  v_field_count := jsonb_array_length(p_response_rows);
  if v_field_count not between 1 and 500 then raise exception 'INVALID_FIELD_COUNT'; end if;

  select * into v_lesson from public.lessons where public_lesson_id = p_public_lesson_id;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  select * into v_version from public.lesson_versions
  where lesson_id = v_lesson.id and version = p_lesson_version;
  if not found then raise exception 'LESSON_VERSION_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_lesson.id::text || ':' || p_attempt_id::text, 0));
  select * into v_existing from public.student_attempts where id = p_attempt_id;
  if found then
    if v_existing.lesson_id <> v_lesson.id or v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.result_payload;
  end if;

  insert into public.student_attempts (
    id, lesson_id, lesson_version_id, owner_id, public_lesson_id, lesson_version,
    student_display_name, request_fingerprint, grader_version, correct_count, total_count,
    result_payload
  ) values (
    p_attempt_id, v_lesson.id, v_version.id, v_lesson.owner_id, p_public_lesson_id,
    p_lesson_version, trim(p_student_display_name), p_request_fingerprint, p_grader_version,
    (p_result_payload #>> '{score,correct}')::integer,
    (p_result_payload #>> '{score,total}')::integer, p_result_payload
  );

  insert into public.student_attempt_responses (
    attempt_id, exercise_id, answer_field_id, response_kind, submitted_value,
    is_correct, accepted_display_values, ordinal
  )
  select p_attempt_id, row.exercise_id, row.answer_field_id, row.response_kind,
    row.submitted_value, row.is_correct, row.accepted_display_values, row.ordinal
  from jsonb_to_recordset(p_response_rows) as row(
    exercise_id text, answer_field_id text, response_kind text, submitted_value jsonb,
    is_correct boolean, accepted_display_values jsonb, ordinal integer
  );

  insert into public.telegram_delivery_outbox (attempt_id, owner_id)
  values (p_attempt_id, v_lesson.owner_id);
  return p_result_payload;
end;
$$;

create or replace function public.claim_telegram_delivery(p_attempt_id uuid, p_claim_token uuid)
returns table (outbox_id uuid, owner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.telegram_delivery_outbox d
  set status = 'sending', claim_token = p_claim_token, claimed_at = now()
  where d.attempt_id = p_attempt_id and d.status = 'pending'
  returning d.id, d.owner_id;
end;
$$;

revoke all on function public.submit_student_attempt(uuid,text,integer,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_student_attempt(uuid,text,integer,text,text,text,jsonb,jsonb) to service_role;
revoke all on function public.claim_telegram_delivery(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_telegram_delivery(uuid,uuid) to service_role;

create or replace function public.claim_student_attempt_rate_limit(
  p_identity_hash text,
  p_limit integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if char_length(p_identity_hash) <> 64 or p_limit not between 1 and 1000 then return false; end if;
  insert into public.student_attempt_rate_limits (identity_hash, bucket_start, request_count)
  values (p_identity_hash, v_bucket, 1)
  on conflict (identity_hash, bucket_start) do update
  set request_count = public.student_attempt_rate_limits.request_count + 1
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.claim_student_attempt_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.claim_student_attempt_rate_limit(text,integer) to service_role;
