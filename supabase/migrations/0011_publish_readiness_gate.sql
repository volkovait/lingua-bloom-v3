drop function if exists public.apply_review_submission(uuid, integer, text, jsonb, jsonb);

create function public.apply_review_submission(
  p_run_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_decisions jsonb,
  p_payload jsonb,
  p_publication_reasons jsonb
)
returns table (new_revision integer, run_status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_draft public.lesson_drafts%rowtype;
  v_decision jsonb;
  v_position integer := 0;
  v_open_blocking integer;
  v_status text;
  v_reasons jsonb := coalesce(p_publication_reasons, '[]'::jsonb);
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(v_reasons) <> 'array' then
    raise exception 'INVALID_PUBLICATION_REASONS';
  end if;

  perform 1 from public.pipeline_runs r
  where r.id = p_run_id and r.owner_id = v_owner_id
  for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;

  select * into v_draft from public.lesson_drafts d
  where d.run_id = p_run_id and d.owner_id = v_owner_id
  for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;

  if exists (
    select 1 from public.review_decisions rd
    where rd.owner_id = v_owner_id and rd.idempotency_key = p_idempotency_key
  ) then
    return query select v_draft.revision, (
      select r.status from public.pipeline_runs r where r.id = p_run_id
    );
    return;
  end if;

  if v_draft.revision <> p_expected_revision then
    raise exception 'DRAFT_VERSION_CONFLICT:%', v_draft.revision;
  end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'EMPTY_REVIEW_SUBMISSION';
  end if;

  for v_decision in select value from jsonb_array_elements(p_decisions)
  loop
    v_position := v_position + 1;
    if v_decision->>'issueId' is not null and not exists (
      select 1 from public.validation_issues vi
      where vi.id = (v_decision->>'issueId')::uuid
        and vi.run_id = p_run_id
        and vi.owner_id = v_owner_id
        and vi.resolution = 'open'
    ) then raise exception 'ISSUE_NOT_OPEN'; end if;

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

    if v_decision->>'issueId' is not null then
      update public.validation_issues
      set resolution = case
        when v_decision->>'decision' = 'exclude' then 'acceptedRisk'
        else 'resolved'
      end
      where id = (v_decision->>'issueId')::uuid
        and run_id = p_run_id
        and owner_id = v_owner_id;
    end if;
  end loop;

  update public.lesson_drafts
  set payload = p_payload,
      revision = revision + 1,
      updated_at = now()
  where id = v_draft.id;

  select count(*) into v_open_blocking
  from public.validation_issues vi
  where vi.run_id = p_run_id
    and vi.owner_id = v_owner_id
    and vi.severity = 'blocking'
    and vi.resolution = 'open';

  if v_open_blocking > 0 and not v_reasons @> '["blocking issues remain open"]'::jsonb then
    v_reasons := v_reasons || '["blocking issues remain open"]'::jsonb;
  end if;
  if coalesce((p_payload #>> '{coverage,unsupportedAdditionCount}')::integer, 0) > 0
    and not v_reasons @> '["unsupported additions remain"]'::jsonb then
    v_reasons := v_reasons || '["unsupported additions remain"]'::jsonb;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload->'groups', '[]'::jsonb)) as g
    cross join lateral jsonb_array_elements(coalesce(g->'exercises', '[]'::jsonb)) as e
    cross join lateral jsonb_array_elements(coalesce(e->'answerFields', '[]'::jsonb)) as a
    where a->>'reviewStatus' is distinct from 'verified'
       or jsonb_array_length(coalesce(a->'acceptedValues', '[]'::jsonb)) = 0
  ) and not v_reasons @> '["answers remain unverified"]'::jsonb then
    v_reasons := v_reasons || '["answers remain unverified"]'::jsonb;
  end if;

  v_status := case
    when jsonb_array_length(v_reasons) = 0 then 'ready_to_publish'
    else 'awaiting_review'
  end;

  update public.pipeline_runs
  set status = v_status,
      current_step = case when v_status = 'ready_to_publish' then 'review-complete' else 'wait-for-review' end,
      last_successful_checkpoint = 'review-submission',
      updated_at = now()
  where id = p_run_id and owner_id = v_owner_id;

  return query select v_draft.revision + 1, v_status;
end;
$$;
