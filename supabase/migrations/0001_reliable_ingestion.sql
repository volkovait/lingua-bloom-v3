create extension if not exists pgcrypto;

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('pdf', 'text')),
  title text not null,
  content_hash text not null,
  storage_ref text not null,
  byte_size bigint not null check (byte_size >= 0),
  created_at timestamptz not null default now(),
  retention_policy text not null default 'retainForProvenance'
    check (retention_policy = 'retainForProvenance'),
  unique (owner_id, content_hash)
);

create table public.document_irs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  schema_version text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('accepted','processing','awaiting_review','blocked','retrying','ready_to_publish','completed','cancelled','failed')),
  failure_kind text check (failure_kind is null or failure_kind in ('retriable','terminal')),
  current_step text,
  idempotency_key text not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.lesson_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  source_document_id uuid not null references public.source_documents(id) on delete restrict,
  document_ir_id uuid references public.document_irs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  draft_version integer not null default 1 check (draft_version > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.validation_issues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  code text not null,
  severity text not null check (severity in ('info','warning','blocking')),
  payload jsonb not null,
  resolution text not null default 'open' check (resolution in ('open','resolved','acceptedRisk')),
  created_at timestamptz not null default now()
);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  draft_version integer not null check (draft_version > 0),
  idempotency_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  source_document_id uuid not null references public.source_documents(id) on delete restrict,
  document_ir_id uuid not null references public.document_irs(id) on delete restrict,
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  version integer not null check (version > 0),
  lesson_spec jsonb not null,
  student_spec jsonb not null,
  validation_report jsonb not null,
  created_at timestamptz not null default now(),
  unique (lesson_id, version),
  unique (run_id)
);

create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create table public.generation_manifests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.pipeline_runs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  payload jsonb not null,
  finalized_at timestamptz not null default now()
);

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

  return query select v_run.id, v_run.source_document_id, v_run.status,
    v_run.request_fingerprint, false;
end;
$$;
