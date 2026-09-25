-- Keep event deletion semantics aligned with the primary SERA 0.3 engine.
-- Historical legacy actions are already checked by request_event_soft_delete();
-- this trigger adds the same protection for actions linked to sera_vnext_analyses.
create or replace function public.block_event_soft_delete_with_current_sera_open_actions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and exists (
    select 1
    from public.corrective_actions ca
    join public.sera_vnext_analyses sva
      on sva.id = ca.sera_vnext_analysis_id
     and sva.tenant_id = ca.tenant_id
    where ca.tenant_id = old.tenant_id
      and sva.source_reference = old.id::text
      and ca.status in ('pending', 'in_progress', 'overdue')
  ) then
    raise exception 'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_event_soft_delete_current_sera_actions on public.events;
create trigger trg_block_event_soft_delete_current_sera_actions
before update of deleted_at on public.events
for each row
execute function public.block_event_soft_delete_with_current_sera_open_actions();

revoke all on function public.block_event_soft_delete_with_current_sera_open_actions() from public, anon, authenticated;
