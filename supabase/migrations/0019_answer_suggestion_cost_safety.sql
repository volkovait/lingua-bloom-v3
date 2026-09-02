begin;

create table public.answer_suggestion_batches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  draft_id uuid not null references public.lesson_drafts(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  draft_revision integer not null check (draft_revision > 0),
  plan_hash text not null check (char_length(plan_hash) = 64),
  batch_index integer not null check (batch_index >= 0),
  batch_hash text not null check (char_length(batch_hash) = 64),
  status text not null check (status in ('processing', 'completed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  suggestions jsonb,
  telemetry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, run_id, draft_revision, plan_hash, batch_index),
  constraint answer_suggestion_batch_completion check (
    (status = 'processing' and claim_token is not null and suggestions is null and telemetry is null and lease_expires_at is not null)
    or
    (status = 'completed' and claim_token is null and suggestions is not null and telemetry is not null and lease_expires_at is null)
  )
);

comment on table public.answer_suggestion_batches is
  'retainForProvenance: retained indefinitely with its source/draft lineage; no TTL or user-facing delete API';

alter table public.answer_suggestion_batches enable row level security;

create policy answer_suggestion_batches_owner_select
on public.answer_suggestion_batches for select
using (owner_id = auth.uid());

create or replace function public.claim_answer_suggestion_batch(
  p_run_id uuid,
  p_draft_id uuid,
  p_draft_revision integer,
  p_plan_hash text,
  p_batch_index integer,
  p_batch_hash text
)
returns table (
  claim_status text,
  claim_token uuid,
  suggestion_payload jsonb,
  telemetry_payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing public.answer_suggestion_batches%rowtype;
  v_claim_token uuid := gen_random_uuid();
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if char_length(p_plan_hash) <> 64 or char_length(p_batch_hash) <> 64 then
    raise exception 'INVALID_PLAN_HASH';
  end if;
  perform 1 from public.pipeline_runs
  where id = p_run_id and owner_id = v_owner_id;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  perform 1 from public.lesson_drafts
  where id = p_draft_id and run_id = p_run_id and owner_id = v_owner_id
    and revision = p_draft_revision;
  if not found then raise exception 'DRAFT_VERSION_CONFLICT'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner_id::text || ':' || p_run_id::text || ':' || p_draft_revision::text || ':' || p_plan_hash || ':' || p_batch_index::text, 0)
  );
  select * into v_existing
  from public.answer_suggestion_batches
  where owner_id = v_owner_id
    and run_id = p_run_id
    and draft_revision = p_draft_revision
    and plan_hash = p_plan_hash
    and batch_index = p_batch_index;

  if v_existing.id is not null and v_existing.batch_hash <> p_batch_hash then
    raise exception 'BATCH_HASH_CONFLICT';
  end if;
  if v_existing.status = 'completed' then
    return query select 'completed', null::uuid, v_existing.suggestions, v_existing.telemetry;
    return;
  end if;
  if v_existing.status = 'processing' and v_existing.lease_expires_at > now() then
    return query select 'in_progress', null::uuid, null::jsonb, null::jsonb;
    return;
  end if;

  insert into public.answer_suggestion_batches (
    run_id, draft_id, owner_id, draft_revision, plan_hash, batch_index, batch_hash,
    status, attempt_count, claim_token, lease_expires_at
  ) values (
    p_run_id, p_draft_id, v_owner_id, p_draft_revision, p_plan_hash, p_batch_index,
    p_batch_hash, 'processing', 1, v_claim_token, now() + interval '2 minutes'
  )
  on conflict (owner_id, run_id, draft_revision, plan_hash, batch_index)
  do update set
    status = 'processing',
    attempt_count = answer_suggestion_batches.attempt_count + 1,
    claim_token = v_claim_token,
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now();

  return query select 'claimed', v_claim_token, null::jsonb, null::jsonb;
end;
$$;

create or replace function public.complete_answer_suggestion_batch(
  p_run_id uuid,
  p_draft_revision integer,
  p_plan_hash text,
  p_batch_index integer,
  p_batch_hash text,
  p_claim_token uuid,
  p_suggestions jsonb,
  p_telemetry jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.answer_suggestion_batches
  set status = 'completed',
      claim_token = null,
      suggestions = p_suggestions,
      telemetry = p_telemetry,
      lease_expires_at = null,
      updated_at = now()
  where owner_id = v_owner_id
    and run_id = p_run_id
    and draft_revision = p_draft_revision
    and plan_hash = p_plan_hash
    and batch_index = p_batch_index
    and batch_hash = p_batch_hash
    and claim_token = p_claim_token
    and status = 'processing';
  if not found then raise exception 'BATCH_CLAIM_NOT_FOUND_OR_STALE'; end if;
end;
$$;

revoke all on function public.claim_answer_suggestion_batch(uuid, uuid, integer, text, integer, text) from public;
grant execute on function public.claim_answer_suggestion_batch(uuid, uuid, integer, text, integer, text) to authenticated;
revoke all on function public.complete_answer_suggestion_batch(uuid, integer, text, integer, text, uuid, jsonb, jsonb) from public;
grant execute on function public.complete_answer_suggestion_batch(uuid, integer, text, integer, text, uuid, jsonb, jsonb) to authenticated;


create table public.layout_classification_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  review_id uuid not null references public.unknown_layout_reviews(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  review_revision integer not null check (review_revision > 0),
  plan_hash text not null check (char_length(plan_hash) = 64),
  status text not null check (status in ('processing', 'completed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  suggestions jsonb,
  telemetry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, run_id, review_revision, plan_hash),
  constraint layout_classification_completion check (
    (status = 'processing' and claim_token is not null and suggestions is null and telemetry is null and lease_expires_at is not null)
    or
    (status = 'completed' and claim_token is null and suggestions is not null and telemetry is not null and lease_expires_at is null)
  )
);

comment on table public.layout_classification_checkpoints is
  'retainForProvenance: retained indefinitely with teacher review lineage; no TTL or user-facing delete API';

alter table public.layout_classification_checkpoints enable row level security;
create policy layout_classification_checkpoints_owner_select
on public.layout_classification_checkpoints for select
using (owner_id = auth.uid());

create or replace function public.claim_layout_classification(
  p_run_id uuid,
  p_review_id uuid,
  p_review_revision integer,
  p_plan_hash text
)
returns table (
  claim_status text,
  claim_token uuid,
  suggestion_payload jsonb,
  telemetry_payload jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing public.layout_classification_checkpoints%rowtype;
  v_claim_token uuid := gen_random_uuid();
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from public.unknown_layout_reviews
  where id = p_review_id and run_id = p_run_id and owner_id = v_owner_id
    and revision = p_review_revision and status = 'active';
  if not found then raise exception 'LAYOUT_REVIEW_VERSION_CONFLICT'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner_id::text || ':' || p_run_id::text || ':' || p_review_revision::text || ':' || p_plan_hash, 0)
  );
  select * into v_existing from public.layout_classification_checkpoints
  where owner_id = v_owner_id and run_id = p_run_id
    and review_revision = p_review_revision and plan_hash = p_plan_hash;

  if v_existing.status = 'completed' then
    return query select 'completed', null::uuid, v_existing.suggestions, v_existing.telemetry;
    return;
  end if;
  if v_existing.status = 'processing' and v_existing.lease_expires_at > now() then
    return query select 'in_progress', null::uuid, null::jsonb, null::jsonb;
    return;
  end if;

  insert into public.layout_classification_checkpoints (
    run_id, review_id, owner_id, review_revision, plan_hash, status,
    attempt_count, claim_token, lease_expires_at
  ) values (
    p_run_id, p_review_id, v_owner_id, p_review_revision, p_plan_hash, 'processing',
    1, v_claim_token, now() + interval '2 minutes'
  )
  on conflict (owner_id, run_id, review_revision, plan_hash)
  do update set
    status = 'processing',
    attempt_count = layout_classification_checkpoints.attempt_count + 1,
    claim_token = v_claim_token,
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now();

  return query select 'claimed', v_claim_token, null::jsonb, null::jsonb;
end;
$$;

create or replace function public.complete_layout_classification(
  p_run_id uuid,
  p_review_revision integer,
  p_plan_hash text,
  p_claim_token uuid,
  p_suggestions jsonb,
  p_telemetry jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.layout_classification_checkpoints
  set status = 'completed', claim_token = null, suggestions = p_suggestions,
      telemetry = p_telemetry, lease_expires_at = null, updated_at = now()
  where owner_id = v_owner_id and run_id = p_run_id
    and review_revision = p_review_revision and plan_hash = p_plan_hash
    and claim_token = p_claim_token and status = 'processing';
  if not found then raise exception 'LAYOUT_CLASSIFICATION_CLAIM_NOT_FOUND_OR_STALE'; end if;
end;
$$;

revoke all on function public.claim_layout_classification(uuid, uuid, integer, text) from public;
grant execute on function public.claim_layout_classification(uuid, uuid, integer, text) to authenticated;
revoke all on function public.complete_layout_classification(uuid, integer, text, uuid, jsonb, jsonb) from public;
grant execute on function public.complete_layout_classification(uuid, integer, text, uuid, jsonb, jsonb) to authenticated;

commit;
