create table public.unknown_layout_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.pipeline_runs(id) on delete restrict,
  source_document_id uuid not null references public.source_documents(id) on delete restrict,
  document_ir_id uuid not null references public.document_irs(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'active' check (status in ('active','resolved')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.unknown_layout_reviews enable row level security;

create policy unknown_layout_reviews_owner_only
on public.unknown_layout_reviews for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.prevent_active_review_and_draft_overlap()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    select 1 from public.unknown_layout_reviews r
    where r.run_id = new.run_id and r.status = 'active'
  ) then raise exception 'ACTIVE_UNKNOWN_LAYOUT_REVIEW_EXISTS'; end if;
  return new;
end;
$$;

create trigger lesson_draft_rejects_active_unknown_layout_review
before insert or update on public.lesson_drafts
for each row execute function public.prevent_active_review_and_draft_overlap();
