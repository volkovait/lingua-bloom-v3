alter table public.lessons
  add column if not exists public_lesson_id text,
  add column if not exists current_published_version_id uuid references public.lesson_versions(id) on delete restrict;

update public.lessons
set public_lesson_id = rtrim(
  replace(replace(encode(gen_random_bytes(16), 'base64'), '/', '_'), '+', '-'),
  '='
)
where public_lesson_id is null;

create unique index if not exists lessons_public_lesson_id_unique on public.lessons(public_lesson_id);
do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lessons_public_lesson_id_urlsafe'
  ) then
    alter table public.lessons
      add constraint lessons_public_lesson_id_urlsafe
      check (public_lesson_id is null or public_lesson_id ~ '^[A-Za-z0-9_-]{22}$') not valid;
  end if;
end
$migration$;
alter table public.lessons validate constraint lessons_public_lesson_id_urlsafe;

update public.lessons l
set current_published_version_id = latest.id
from (
  select distinct on (lesson_id) lesson_id, id
  from public.lesson_versions
  order by lesson_id, version desc
) latest
where l.id = latest.lesson_id
  and l.current_published_version_id is null;

create or replace function public.prevent_public_lesson_id_change()
returns trigger language plpgsql as $$
begin
  if old.public_lesson_id is not null and old.public_lesson_id is distinct from new.public_lesson_id then
    raise exception 'public lesson ID is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists lessons_public_id_immutable on public.lessons;
create trigger lessons_public_id_immutable
before update of public_lesson_id on public.lessons
for each row execute function public.prevent_public_lesson_id_change();
