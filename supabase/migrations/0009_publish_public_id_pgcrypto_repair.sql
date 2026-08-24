create or replace function public.publish_reviewed_draft(
  p_run_id uuid,
  p_expected_revision integer,
  p_lesson_id uuid,
  p_confirm_permanent_public_access boolean,
  p_lesson_spec jsonb,
  p_student_spec jsonb,
  p_validation_report jsonb
)
returns table (lesson_id uuid, public_lesson_id text, version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_run public.pipeline_runs%rowtype;
  v_draft public.lesson_drafts%rowtype;
  v_lesson public.lessons%rowtype;
  v_version public.lesson_versions%rowtype;
  v_student_spec jsonb;
begin
  if v_owner_id is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_run from public.pipeline_runs r
  where r.id = p_run_id and r.owner_id = v_owner_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if v_run.status <> 'ready_to_publish' then raise exception 'PUBLISH_BLOCKED'; end if;

  select * into v_draft from public.lesson_drafts d
  where d.run_id = p_run_id and d.owner_id = v_owner_id for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if v_draft.revision <> p_expected_revision then
    raise exception 'DRAFT_VERSION_CONFLICT:%', v_draft.revision;
  end if;

  select l.* into v_lesson
  from public.lessons l
  join public.lesson_versions lv on lv.lesson_id = l.id
  where lv.source_document_id = v_run.source_document_id and l.owner_id = v_owner_id
  order by lv.version desc limit 1;

  if not found then
    if p_confirm_permanent_public_access is not true then
      raise exception 'PERMANENT_PUBLIC_ACCESS_CONFIRMATION_REQUIRED';
    end if;
    insert into public.lessons (id, owner_id, title, public_lesson_id)
    values (
      p_lesson_id,
      v_owner_id,
      p_lesson_spec->>'title',
      rtrim(replace(replace(encode(extensions.gen_random_bytes(16), 'base64'), '/', '_'), '+', '-'), '=')
    ) returning * into v_lesson;
  end if;

  if v_lesson.id <> p_lesson_id then raise exception 'LESSON_IDENTITY_CONFLICT'; end if;
  v_student_spec := jsonb_set(
    p_student_spec,
    '{publicLessonId}',
    to_jsonb(v_lesson.public_lesson_id),
    true
  );

  insert into public.lesson_versions (
    lesson_id, owner_id, source_document_id, document_ir_id, run_id, version,
    lesson_spec, student_spec, validation_report
  ) values (
    v_lesson.id, v_owner_id, v_run.source_document_id, v_draft.document_ir_id, p_run_id,
    coalesce((select max(lv.version) + 1 from public.lesson_versions lv where lv.lesson_id = v_lesson.id), 1),
    p_lesson_spec, v_student_spec, p_validation_report
  ) returning * into v_version;

  update public.lessons set current_published_version_id = v_version.id where id = v_lesson.id;
  update public.pipeline_runs
  set status = 'completed', current_step = 'publish-version',
      last_successful_checkpoint = 'publish-version', updated_at = now()
  where id = p_run_id;

  return query select v_lesson.id, v_lesson.public_lesson_id, v_version.version;
end;
$$;
