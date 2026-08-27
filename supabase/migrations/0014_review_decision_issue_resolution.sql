create or replace function public.resolve_review_decision_issues()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.validation_issues vi
  set resolution = case
    when new.payload->>'decision' = 'exclude' then 'acceptedRisk'
    else 'resolved'
  end
  where vi.run_id = new.run_id
    and vi.owner_id = new.owner_id
    and vi.resolution = 'open'
    and vi.id in (
      select resolved_id::uuid
      from jsonb_array_elements_text(
        coalesce(new.payload->'resolvedIssueIds', '[]'::jsonb)
      ) as ids(resolved_id)
    );

  return new;
end;
$$;

drop trigger if exists review_decisions_resolve_linked_issues
on public.review_decisions;

create trigger review_decisions_resolve_linked_issues
after insert on public.review_decisions
for each row execute function public.resolve_review_decision_issues();
