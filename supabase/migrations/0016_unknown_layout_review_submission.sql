create unique index if not exists lesson_drafts_run_unique on public.lesson_drafts(run_id);

create table public.unknown_layout_review_submissions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

alter table public.unknown_layout_review_submissions enable row level security;
create policy unknown_layout_review_submissions_owner_only
on public.unknown_layout_review_submissions for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.prevent_draft_and_active_review_overlap()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.lesson_drafts d where d.run_id = new.run_id
  ) then raise exception 'LESSON_DRAFT_EXISTS'; end if;
  return new;
end;
$$;

create trigger unknown_layout_review_rejects_existing_draft
before insert or update on public.unknown_layout_reviews
for each row execute function public.prevent_draft_and_active_review_overlap();

create or replace function public.apply_unknown_layout_review_submission(
  p_run_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_review_payload jsonb,
  p_review_status text,
  p_decisions jsonb,
  p_draft_payload jsonb,
  p_answer_issues jsonb
)
returns table (new_revision integer, run_status text, replayed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_review public.unknown_layout_reviews%rowtype;
  v_source public.pipeline_runs%rowtype;
  v_existing public.unknown_layout_review_submissions%rowtype;
  v_decision jsonb;
  v_issue jsonb;
  v_position integer := 0;
  v_next_revision integer;
  v_run_status text;
  v_response jsonb;
  v_sequence integer;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_review_status not in ('active','resolved') then raise exception 'INVALID_REVIEW_STATUS'; end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'EMPTY_LAYOUT_REVIEW_SUBMISSION';
  end if;

  select * into v_existing from public.unknown_layout_review_submissions s
  where s.owner_id = v_owner_id and s.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return query select
      (v_existing.response_payload->>'revision')::integer,
      v_existing.response_payload->>'status',
      true;
    return;
  end if;

  select * into v_source from public.pipeline_runs r
  where r.id = p_run_id and r.owner_id = v_owner_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;

  select * into v_review from public.unknown_layout_reviews r
  where r.run_id = p_run_id and r.owner_id = v_owner_id for update;
  if not found then raise exception 'UNKNOWN_LAYOUT_REVIEW_NOT_FOUND'; end if;
  if v_review.status <> 'active' then raise exception 'UNKNOWN_LAYOUT_REVIEW_RESOLVED'; end if;
  if v_review.revision <> p_expected_revision then
    raise exception 'LAYOUT_REVIEW_VERSION_CONFLICT:%', v_review.revision;
  end if;

  v_next_revision := v_review.revision + 1;
  update public.unknown_layout_reviews
  set revision = v_next_revision,
      status = p_review_status,
      payload = p_review_payload,
      updated_at = now()
  where id = v_review.id;

  for v_decision in select value from jsonb_array_elements(p_decisions)
  loop
    v_position := v_position + 1;
    insert into public.review_decisions (
      id, run_id, owner_id, draft_version, idempotency_key, payload
    ) values (
      (v_decision->>'id')::uuid,
      p_run_id,
      v_owner_id,
      p_expected_revision,
      case when v_position = 1 then p_idempotency_key else p_idempotency_key || ':' || v_position::text end,
      v_decision
    );
  end loop;

  if p_review_status = 'resolved' then
    if p_draft_payload is null then raise exception 'RESOLVED_REVIEW_REQUIRES_DRAFT'; end if;
    insert into public.lesson_drafts (
      run_id, source_document_id, document_ir_id, owner_id, revision, payload
    ) values (
      p_run_id, v_review.source_document_id, v_review.document_ir_id, v_owner_id, 1, p_draft_payload
    );
    for v_issue in select value from jsonb_array_elements(coalesce(p_answer_issues, '[]'::jsonb))
    loop
      insert into public.validation_issues (id, run_id, owner_id, code, severity, payload, resolution)
      values (
        (v_issue->>'id')::uuid, p_run_id, v_owner_id, v_issue->>'code',
        v_issue->>'severity', v_issue, v_issue->>'resolution'
      );
    end loop;
    update public.validation_issues
    set resolution = 'resolved'
    where run_id = p_run_id and owner_id = v_owner_id
      and code = 'UNSUPPORTED_LAYOUT' and resolution = 'open';
    v_run_status := 'awaiting_review';
    update public.pipeline_runs
    set status = v_run_status, current_step = 'wait-for-review',
        last_successful_checkpoint = 'assemble-draft', updated_at = now()
    where id = p_run_id and owner_id = v_owner_id;
  else
    if p_draft_payload is not null then raise exception 'ACTIVE_REVIEW_CANNOT_HAVE_DRAFT'; end if;
    v_run_status := 'awaiting_review';
    update public.pipeline_runs set updated_at = now()
    where id = p_run_id and owner_id = v_owner_id;
  end if;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.run_events where run_id = p_run_id;
  insert into public.run_events (run_id, owner_id, sequence, event_type, payload)
  values (
    p_run_id, v_owner_id, v_sequence, 'layout-review-saved',
    jsonb_build_object(
      'runId', p_run_id, 'sequence', v_sequence, 'type', 'layout-review-saved',
      'status', v_run_status,
      'step', case when p_review_status = 'resolved' then 'assemble-draft' else 'await-layout-review' end,
      'occurredAt', now(),
      'attributes', jsonb_build_object('decisionCount', jsonb_array_length(p_decisions))
    )
  );

  v_response := jsonb_build_object('revision', v_next_revision, 'status', v_run_status);
  insert into public.unknown_layout_review_submissions (
    run_id, owner_id, idempotency_key, request_fingerprint, response_payload
  ) values (p_run_id, v_owner_id, p_idempotency_key, p_request_fingerprint, v_response);

  return query select v_next_revision, v_run_status, false;
end;
$$;
