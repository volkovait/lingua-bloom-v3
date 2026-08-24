create table if not exists public.run_resume_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  checkpoint text,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  foreign key (run_id, owner_id)
    references public.pipeline_runs(id, owner_id) on delete restrict
);

alter table public.run_resume_requests enable row level security;
create policy run_resume_requests_owner_select on public.run_resume_requests
for select to authenticated using (owner_id = auth.uid());
create policy run_resume_requests_owner_insert on public.run_resume_requests
for insert to authenticated with check (owner_id = auth.uid());

create trigger run_resume_requests_immutable
before update or delete on public.run_resume_requests
for each row execute function public.prevent_immutable_artifact_change();

create or replace function public.resume_failed_import(
  p_run_id uuid,
  p_idempotency_key text
)
returns table (
  run_id uuid,
  source_document_id uuid,
  request_fingerprint text,
  source_kind text,
  checkpoint text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_run public.pipeline_runs%rowtype;
  v_existing public.run_resume_requests%rowtype;
  v_source_kind text;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner_id::text || ':resume:' || p_idempotency_key, 0)
  );
  select * into v_existing from public.run_resume_requests r
  where r.owner_id = v_owner_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.run_id <> p_run_id then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    select * into v_run from public.pipeline_runs r
    where r.id = p_run_id and r.owner_id = v_owner_id;
    if not found then raise exception 'RUN_NOT_OWNED'; end if;
    select s.kind into v_source_kind from public.source_documents s
    where s.id = v_run.source_document_id and s.owner_id = v_owner_id;
    return query select v_run.id, v_run.source_document_id, v_run.request_fingerprint,
      v_source_kind, v_existing.checkpoint, true;
    return;
  end if;

  select * into v_run from public.pipeline_runs r
  where r.id = p_run_id and r.owner_id = v_owner_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if v_run.status <> 'failed' or v_run.failure_kind <> 'retriable'
     or v_run.manual_resume_allowed is not true then
    raise exception 'RESUME_NOT_ALLOWED';
  end if;
  select s.kind into v_source_kind from public.source_documents s
  where s.id = v_run.source_document_id and s.owner_id = v_owner_id;
  if not found then raise exception 'SOURCE_NOT_OWNED'; end if;

  insert into public.run_resume_requests (run_id, owner_id, idempotency_key, checkpoint)
  values (p_run_id, v_owner_id, p_idempotency_key, v_run.last_successful_checkpoint);
  update public.pipeline_runs
  set status = 'processing', failure_kind = null, failure_code = null,
      failure_message = null, manual_resume_allowed = false, updated_at = now()
  where id = p_run_id and owner_id = v_owner_id;

  return query select v_run.id, v_run.source_document_id, v_run.request_fingerprint,
    v_source_kind, v_run.last_successful_checkpoint, false;
end;
$$;
