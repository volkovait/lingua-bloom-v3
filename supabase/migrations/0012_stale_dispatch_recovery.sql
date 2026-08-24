create table if not exists public.run_dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  reason text not null check (reason in ('dispatch_not_started', 'worker_heartbeat_expired')),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  foreign key (run_id, owner_id)
    references public.pipeline_runs(id, owner_id) on delete restrict
);

alter table public.run_dispatch_requests enable row level security;
create policy run_dispatch_requests_owner_select on public.run_dispatch_requests
for select to authenticated using (owner_id = auth.uid());
create policy run_dispatch_requests_owner_insert on public.run_dispatch_requests
for insert to authenticated with check (owner_id = auth.uid());

create trigger run_dispatch_requests_immutable
before update or delete on public.run_dispatch_requests
for each row execute function public.prevent_immutable_artifact_change();

create or replace function public.bind_import_run(
  p_source_document_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (
  run_id uuid,
  source_document_id uuid,
  status text,
  request_fingerprint text,
  was_replay boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing public.pipeline_runs%rowtype;
  v_run public.pipeline_runs%rowtype;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.source_documents s
    where s.id = p_source_document_id and s.owner_id = v_owner_id
  ) then raise exception 'SOURCE_NOT_OWNED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.pipeline_runs r
  where r.owner_id = v_owner_id and r.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.id, v_existing.source_document_id, v_existing.status,
      v_existing.request_fingerprint, true;
    return;
  end if;

  insert into public.pipeline_runs (
    source_document_id, owner_id, status, idempotency_key, request_fingerprint
  ) values (
    p_source_document_id, v_owner_id, 'accepted', p_idempotency_key, p_request_fingerprint
  ) returning * into v_run;

  insert into public.run_events (run_id, owner_id, sequence, event_type, payload)
  values (
    v_run.id,
    v_owner_id,
    1,
    'accepted',
    jsonb_build_object(
      'runId', v_run.id,
      'sequence', 1,
      'type', 'accepted',
      'status', 'accepted',
      'step', 'accepted',
      'occurredAt', v_run.created_at,
      'attributes', jsonb_build_object()
    )
  );

  return query select v_run.id, v_run.source_document_id, v_run.status,
    v_run.request_fingerprint, false;
end;
$$;

create or replace function public.claim_stale_import_dispatch(
  p_run_id uuid,
  p_idempotency_key text
)
returns table (
  dispatch_request_id uuid,
  run_id uuid,
  source_document_id uuid,
  request_fingerprint text,
  source_kind text,
  reason text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_run public.pipeline_runs%rowtype;
  v_existing public.run_dispatch_requests%rowtype;
  v_request public.run_dispatch_requests%rowtype;
  v_source_kind text;
  v_reason text;
  v_sequence integer;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':dispatch:' || p_run_id::text, 0));

  select * into v_existing from public.run_dispatch_requests d
  where d.owner_id = v_owner_id and d.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.run_id <> p_run_id then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    select * into v_run from public.pipeline_runs r
    where r.id = p_run_id and r.owner_id = v_owner_id;
    if not found then raise exception 'RUN_NOT_OWNED'; end if;
    select s.kind into v_source_kind from public.source_documents s
    where s.id = v_run.source_document_id and s.owner_id = v_owner_id;
    return query select v_existing.id, v_run.id, v_run.source_document_id,
      v_run.request_fingerprint, v_source_kind, v_existing.reason, true;
    return;
  end if;

  select * into v_run from public.pipeline_runs r
  where r.id = p_run_id and r.owner_id = v_owner_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if exists (
    select 1 from public.lesson_drafts d
    where d.run_id = p_run_id and d.owner_id = v_owner_id
  ) then raise exception 'DISPATCH_NOT_ALLOWED'; end if;

  if v_run.status = 'accepted' and v_run.updated_at <= now() - interval '30 seconds' then
    v_reason := 'dispatch_not_started';
  elsif v_run.status = 'processing' and v_run.updated_at <= now() - interval '3 minutes' then
    v_reason := 'worker_heartbeat_expired';
  else
    raise exception 'DISPATCH_NOT_STALE';
  end if;

  select s.kind into v_source_kind from public.source_documents s
  where s.id = v_run.source_document_id and s.owner_id = v_owner_id;
  if not found then raise exception 'SOURCE_NOT_OWNED'; end if;

  insert into public.run_dispatch_requests (run_id, owner_id, idempotency_key, reason)
  values (p_run_id, v_owner_id, p_idempotency_key, v_reason)
  returning * into v_request;

  update public.pipeline_runs
  set updated_at = now()
  where id = p_run_id and owner_id = v_owner_id;

  select coalesce(max(e.sequence), 0) + 1 into v_sequence
  from public.run_events e where e.run_id = p_run_id;
  insert into public.run_events (run_id, owner_id, sequence, event_type, payload)
  values (
    p_run_id,
    v_owner_id,
    v_sequence,
    'redispatch-requested',
    jsonb_build_object(
      'runId', p_run_id,
      'sequence', v_sequence,
      'type', 'redispatch-requested',
      'status', v_run.status,
      'step', 'redispatch-requested',
      'occurredAt', now(),
      'attributes', jsonb_build_object('reason', v_reason)
    )
  );

  return query select v_request.id, v_run.id, v_run.source_document_id,
    v_run.request_fingerprint, v_source_kind, v_reason, false;
end;
$$;
