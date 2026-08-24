alter table public.pipeline_runs
  add column if not exists last_successful_checkpoint text,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists manual_resume_allowed boolean not null default false;

update public.pipeline_runs
set status = 'failed',
    failure_kind = 'retriable',
    failure_code = coalesce(failure_code, 'LEGACY_RETRIABLE_FAILURE'),
    failure_message = coalesce(failure_message, 'Manual continuation is required'),
    manual_resume_allowed = true
where status = 'retrying';

update public.pipeline_runs
set failure_kind = coalesce(failure_kind, 'terminal'),
    failure_code = coalesce(failure_code, 'LEGACY_TERMINAL_FAILURE'),
    failure_message = coalesce(failure_message, 'The run cannot continue'),
    manual_resume_allowed = coalesce(failure_kind, 'terminal') = 'retriable'
where status = 'failed';

update public.pipeline_runs
set failure_kind = null,
    failure_code = null,
    failure_message = null,
    manual_resume_allowed = false
where status <> 'failed';

alter table public.pipeline_runs drop constraint if exists pipeline_runs_status_check;
alter table public.pipeline_runs
  add constraint pipeline_runs_status_check
  check (status in ('accepted','processing','awaiting_review','blocked','ready_to_publish','completed','cancelled','failed'))
  not valid;
alter table public.pipeline_runs validate constraint pipeline_runs_status_check;

alter table public.pipeline_runs drop constraint if exists pipeline_runs_failure_lifecycle_check;
alter table public.pipeline_runs
  add constraint pipeline_runs_failure_lifecycle_check
  check (
    (
      status = 'failed'
      and failure_kind in ('retriable','terminal')
      and failure_code is not null
      and failure_message is not null
      and manual_resume_allowed = (failure_kind = 'retriable')
    )
    or
    (
      status <> 'failed'
      and failure_kind is null
      and failure_code is null
      and failure_message is null
      and manual_resume_allowed = false
    )
  ) not valid;
alter table public.pipeline_runs validate constraint pipeline_runs_failure_lifecycle_check;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lesson_drafts' and column_name = 'draft_version'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lesson_drafts' and column_name = 'revision'
  ) then
    alter table public.lesson_drafts rename column draft_version to revision;
  end if;
end
$migration$;

create or replace function public.compare_and_swap_lesson_draft(
  p_draft_id uuid,
  p_expected_revision integer,
  p_payload jsonb
)
returns table (new_revision integer, saved_payload jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_current_revision integer;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;

  select d.revision into v_current_revision
  from public.lesson_drafts d
  where d.id = p_draft_id and d.owner_id = v_owner_id;

  if not found then raise exception 'DRAFT_NOT_OWNED'; end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'DRAFT_VERSION_CONFLICT:%', v_current_revision;
  end if;

  return query
  update public.lesson_drafts d
  set payload = p_payload,
      revision = d.revision + 1,
      updated_at = now()
  where d.id = p_draft_id
    and d.owner_id = v_owner_id
    and d.revision = p_expected_revision
  returning d.revision, d.payload;

  if not found then raise exception 'DRAFT_VERSION_CONFLICT'; end if;
end;
$$;
