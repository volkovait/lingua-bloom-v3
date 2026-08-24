create unique index if not exists source_documents_id_owner_unique
  on public.source_documents(id, owner_id);
create unique index if not exists document_irs_id_owner_unique
  on public.document_irs(id, owner_id);
create unique index if not exists pipeline_runs_id_owner_unique
  on public.pipeline_runs(id, owner_id);
create unique index if not exists lessons_id_owner_unique
  on public.lessons(id, owner_id);

alter table public.document_irs
  add constraint document_irs_source_owner_fkey
  foreign key (source_document_id, owner_id)
  references public.source_documents(id, owner_id) on delete restrict not valid;
alter table public.document_irs validate constraint document_irs_source_owner_fkey;

alter table public.pipeline_runs
  add constraint pipeline_runs_source_owner_fkey
  foreign key (source_document_id, owner_id)
  references public.source_documents(id, owner_id) on delete restrict not valid;
alter table public.pipeline_runs validate constraint pipeline_runs_source_owner_fkey;

alter table public.lesson_drafts
  add constraint lesson_drafts_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid,
  add constraint lesson_drafts_source_owner_fkey
  foreign key (source_document_id, owner_id)
  references public.source_documents(id, owner_id) on delete restrict not valid,
  add constraint lesson_drafts_ir_owner_fkey
  foreign key (document_ir_id, owner_id)
  references public.document_irs(id, owner_id) on delete restrict not valid;
alter table public.lesson_drafts validate constraint lesson_drafts_run_owner_fkey;
alter table public.lesson_drafts validate constraint lesson_drafts_source_owner_fkey;
alter table public.lesson_drafts validate constraint lesson_drafts_ir_owner_fkey;

alter table public.validation_issues
  add constraint validation_issues_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid;
alter table public.validation_issues validate constraint validation_issues_run_owner_fkey;

alter table public.review_decisions
  add constraint review_decisions_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid;
alter table public.review_decisions validate constraint review_decisions_run_owner_fkey;

alter table public.lesson_versions
  add constraint lesson_versions_lesson_owner_fkey
  foreign key (lesson_id, owner_id)
  references public.lessons(id, owner_id) on delete restrict not valid,
  add constraint lesson_versions_source_owner_fkey
  foreign key (source_document_id, owner_id)
  references public.source_documents(id, owner_id) on delete restrict not valid,
  add constraint lesson_versions_ir_owner_fkey
  foreign key (document_ir_id, owner_id)
  references public.document_irs(id, owner_id) on delete restrict not valid,
  add constraint lesson_versions_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid;
alter table public.lesson_versions validate constraint lesson_versions_lesson_owner_fkey;
alter table public.lesson_versions validate constraint lesson_versions_source_owner_fkey;
alter table public.lesson_versions validate constraint lesson_versions_ir_owner_fkey;
alter table public.lesson_versions validate constraint lesson_versions_run_owner_fkey;

alter table public.run_events
  add constraint run_events_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid;
alter table public.run_events validate constraint run_events_run_owner_fkey;

alter table public.generation_manifests
  add constraint generation_manifests_run_owner_fkey
  foreign key (run_id, owner_id)
  references public.pipeline_runs(id, owner_id) on delete restrict not valid;
alter table public.generation_manifests validate constraint generation_manifests_run_owner_fkey;

create or replace function public.prevent_immutable_artifact_change()
returns trigger language plpgsql as $$
begin
  raise exception '% is immutable', tg_table_name;
end;
$$;

create trigger source_documents_immutable_update
before update on public.source_documents
for each row execute function public.prevent_immutable_artifact_change();
create trigger document_irs_immutable
before update or delete on public.document_irs
for each row execute function public.prevent_immutable_artifact_change();
create trigger review_decisions_immutable
before update or delete on public.review_decisions
for each row execute function public.prevent_immutable_artifact_change();
create trigger run_events_immutable
before update or delete on public.run_events
for each row execute function public.prevent_immutable_artifact_change();
create trigger generation_manifests_immutable
before update or delete on public.generation_manifests
for each row execute function public.prevent_immutable_artifact_change();

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'source_documents','document_irs','pipeline_runs','lesson_drafts','validation_issues',
    'review_decisions','lessons','lesson_versions','run_events','generation_manifests'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_table_name || '_owner_only', v_table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
      v_table_name || '_owner_select', v_table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
      v_table_name || '_owner_insert', v_table_name
    );
  end loop;
end
$migration$;

create policy pipeline_runs_owner_update on public.pipeline_runs
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy lesson_drafts_owner_update on public.lesson_drafts
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy validation_issues_owner_update on public.validation_issues
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy lessons_owner_update on public.lessons
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists source_objects_owner_select on storage.objects;
drop policy if exists source_objects_owner_insert on storage.objects;
create policy source_objects_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'sources'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[3] is null
  and storage.filename(name) in ('original.pdf','original.txt')
);
create policy source_objects_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sources'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[3] is null
  and storage.filename(name) in ('original.pdf','original.txt')
);
