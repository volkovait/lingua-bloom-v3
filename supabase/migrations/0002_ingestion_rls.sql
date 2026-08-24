alter table public.source_documents enable row level security;
alter table public.document_irs enable row level security;
alter table public.pipeline_runs enable row level security;
alter table public.lesson_drafts enable row level security;
alter table public.validation_issues enable row level security;
alter table public.review_decisions enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_versions enable row level security;
alter table public.run_events enable row level security;
alter table public.generation_manifests enable row level security;

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'source_documents','document_irs','pipeline_runs','lesson_drafts','validation_issues',
    'review_decisions','lessons','lesson_versions','run_events','generation_manifests'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      v_table_name || '_owner_only', v_table_name
    );
  end loop;
end
$migration$;

create or replace function public.prevent_immutable_lesson_version_change()
returns trigger language plpgsql as $$
begin
  raise exception 'published lesson versions are immutable';
end;
$$;

create trigger lesson_versions_immutable
before update or delete on public.lesson_versions
for each row execute function public.prevent_immutable_lesson_version_change();

create or replace function public.prevent_source_document_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'source documents are retained for provenance';
end;
$$;

create trigger source_documents_retained
before delete on public.source_documents
for each row execute function public.prevent_source_document_delete();
