alter table public.lessons alter column public_lesson_id drop not null;

update public.lessons l
set current_published_version_id = latest.id
from (
  select distinct on (lesson_id) lesson_id, id
  from public.lesson_versions
  order by lesson_id, version desc
) latest
where l.id = latest.lesson_id
  and l.current_published_version_id is null;

create unique index if not exists lesson_versions_id_lesson_unique
  on public.lesson_versions(id, lesson_id);

alter table public.lessons
  drop constraint if exists lessons_current_published_version_id_fkey;
alter table public.lessons
  add constraint lessons_current_published_version_same_lesson_fkey
  foreign key (current_published_version_id, id)
  references public.lesson_versions(id, lesson_id) on delete restrict not valid;
alter table public.lessons
  validate constraint lessons_current_published_version_same_lesson_fkey;

create or replace function public.prevent_public_lesson_id_change()
returns trigger language plpgsql as $$
begin
  if old.public_lesson_id is not null and old.public_lesson_id is distinct from new.public_lesson_id then
    raise exception 'public lesson ID is immutable';
  end if;
  return new;
end;
$$;
