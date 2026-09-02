-- Owner-scoped attempt history indexes and durable Telegram recovery.
create index if not exists student_attempts_owner_created_idx
  on public.student_attempts (owner_id, created_at desc, id desc);
create index if not exists student_attempts_owner_lesson_created_idx
  on public.student_attempts (owner_id, lesson_id, created_at desc, id desc);
create index if not exists telegram_outbox_owner_status_created_idx
  on public.telegram_delivery_outbox (owner_id, status, created_at desc);

create or replace function public.list_teacher_attempts(
  p_owner_id uuid, p_limit integer default 26,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null,
  p_query text default '', p_lesson_id uuid default null,
  p_result_status text default null, p_delivery_status text default null
)
returns table (
  attempt_id uuid, lesson_id uuid, lesson_title text, lesson_version integer,
  student_display_name text, created_at timestamptz, correct_count integer,
  total_count integer, delivery_status text, failure_category text, matched_count bigint
)
language sql security definer set search_path = public as $$
  with filtered as (
    select a.id, a.lesson_id, l.title, a.lesson_version, a.student_display_name, a.created_at,
      a.correct_count, a.total_count, coalesce(o.status, 'pending') as delivery_status,
      o.failure_category
    from public.student_attempts a
    join public.lessons l on l.id = a.lesson_id and l.owner_id = a.owner_id
    left join public.telegram_delivery_outbox o on o.attempt_id = a.id and o.owner_id = a.owner_id
    where a.owner_id = p_owner_id
    and (p_lesson_id is null or a.lesson_id = p_lesson_id)
    and (nullif(trim(p_query), '') is null
      or position(lower(trim(p_query)) in lower(l.title)) > 0
      or position(lower(trim(p_query)) in lower(a.student_display_name)) > 0)
    and (p_result_status is null
      or (p_result_status = 'correct' and a.correct_count = a.total_count)
      or (p_result_status = 'incorrect' and a.correct_count = 0)
      or (p_result_status = 'partial' and a.correct_count > 0 and a.correct_count < a.total_count))
    and (p_delivery_status is null or coalesce(o.status, 'pending') = p_delivery_status)
  )
  select f.id, f.lesson_id, f.title, f.lesson_version, f.student_display_name, f.created_at,
    f.correct_count, f.total_count, f.delivery_status, f.failure_category,
    (select count(*) from filtered)
  from filtered f
  where p_cursor_created_at is null or (f.created_at, f.id) < (p_cursor_created_at, p_cursor_id)
  order by f.created_at desc, f.id desc
  limit least(greatest(p_limit, 1), 101);
$$;

create or replace function public.recover_stale_telegram_deliveries()
returns table (attempt_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  update public.telegram_delivery_outbox
  set status = 'pending', claim_token = null, claimed_at = null
  where status = 'sending' and claimed_at < now() - interval '10 minutes';
  return query
  select o.attempt_id from public.telegram_delivery_outbox o
  where o.status = 'pending' and o.created_at < now() - interval '2 minutes'
  order by o.created_at limit 100;
end;
$$;
revoke all on function public.list_teacher_attempts(uuid,integer,timestamptz,uuid,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.list_teacher_attempts(uuid,integer,timestamptz,uuid,text,uuid,text,text)
  to service_role;
revoke all on function public.recover_stale_telegram_deliveries() from public, anon, authenticated;
grant execute on function public.recover_stale_telegram_deliveries() to service_role;
