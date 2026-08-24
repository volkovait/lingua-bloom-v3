insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 52428800, array['application/pdf', 'text/plain'])
on conflict (id) do update set public = false;

create policy source_objects_owner_select on storage.objects
for select to authenticated
using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy source_objects_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

-- No update/delete policy is intentional: feature 001 preserves immutable source evidence.
