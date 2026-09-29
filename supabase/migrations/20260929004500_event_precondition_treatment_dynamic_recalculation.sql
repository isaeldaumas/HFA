-- Event/precondition traceability for SERA treatment + dynamic exclusion from active aggregates.
-- The event remains the source-of-truth boundary: soft delete removes its derived treatment/risk
-- contribution from active queries without destroying audit history; restore reactivates it.

alter table public.corrective_actions
  alter column related_failure type text;

alter table public.corrective_actions
  add column if not exists source_event_id uuid references public.events(id) on delete set null,
  add column if not exists precondition_id text,
  add column if not exists precondition_category text,
  add column if not exists action_kind text;

-- Backfill stable event identity for historical rows without rewriting their methodological content.
update public.corrective_actions ca
set source_event_id = a.event_id
from public.analyses a
where ca.analysis_id = a.id
  and ca.source_event_id is null;

update public.corrective_actions ca
set source_event_id = e.id
from public.sera_vnext_analyses sva
join public.events e on e.id::text = sva.source_reference and e.tenant_id = sva.tenant_id
where ca.sera_vnext_analysis_id = sva.id
  and ca.tenant_id = sva.tenant_id
  and ca.source_event_id is null;

-- If any current-engine action already exists, recover its precondition identity from the engine output.
with matched as (
  select distinct on (ca.id)
    ca.id,
    pc.value->>'id' as precondition_id,
    pc.value->>'canonicalCategory' as precondition_category,
    case
      when ca.related_failure like 'INVESTIGATE:%' then 'INVESTIGATION'
      else 'CORRECTIVE_PREVENTIVE'
    end as action_kind
  from public.corrective_actions ca
  join public.sera_vnext_analyses sva on sva.id = ca.sera_vnext_analysis_id and sva.tenant_id = ca.tenant_id
  cross join lateral jsonb_array_elements(coalesce(sva.engine_output->'preconditions', '[]'::jsonb)) pc(value)
  where ca.sera_vnext_analysis_id is not null
    and pc.value->>'canonicalCategory' is not null
    and ca.related_failure in (
      'PC:' || (pc.value->>'canonicalCategory'),
      'INVESTIGATE:' || (pc.value->>'canonicalCategory')
    )
  order by ca.id, pc.value->>'id'
)
update public.corrective_actions ca
set precondition_id = coalesce(ca.precondition_id, matched.precondition_id),
    precondition_category = coalesce(ca.precondition_category, matched.precondition_category),
    action_kind = coalesce(ca.action_kind, matched.action_kind)
from matched
where ca.id = matched.id;

alter table public.corrective_actions
  drop constraint if exists corrective_actions_action_kind_check;
alter table public.corrective_actions
  add constraint corrective_actions_action_kind_check
  check (action_kind is null or action_kind in ('CORRECTIVE_PREVENTIVE', 'INVESTIGATION'));

-- Sine qua non for the current SERA engine: an action cannot exist without its event and
-- the exact precondition that justified either treatment or further investigation.
alter table public.corrective_actions
  drop constraint if exists corrective_actions_current_precondition_traceability_check;
alter table public.corrective_actions
  add constraint corrective_actions_current_precondition_traceability_check
  check (
    sera_vnext_analysis_id is null
    or (
      source_event_id is not null
      and precondition_id is not null and length(btrim(precondition_id)) > 0
      and precondition_category is not null and length(btrim(precondition_category)) > 0
      and action_kind in ('CORRECTIVE_PREVENTIVE', 'INVESTIGATION')
    )
  );

create index if not exists idx_corrective_actions_source_event
  on public.corrective_actions(tenant_id, source_event_id);
create index if not exists idx_corrective_actions_precondition
  on public.corrective_actions(tenant_id, precondition_category, action_kind);
create unique index if not exists uq_corrective_actions_active_event_precondition_kind
  on public.corrective_actions(tenant_id, source_event_id, precondition_category, action_kind)
  where sera_vnext_analysis_id is not null
    and status <> 'cancelled'::public.corrective_action_status;

-- Open actions are derivative records; they must not prevent a recoverable event exclusion.
-- They remain in the database for audit and are automatically absent from active views while
-- the source event is soft-deleted. Permanent purge keeps its stricter blockers.
drop trigger if exists trg_block_event_soft_delete_current_sera_actions on public.events;
drop function if exists public.block_event_soft_delete_with_current_sera_open_actions();

create or replace function public.request_event_soft_delete(
  p_event_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_confirmation_title text,
  p_request_id text,
  p_unknown_dependencies text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_event record;
  v_now timestamptz := clock_timestamp();
  v_recoverable_until timestamptz := clock_timestamp() + interval '30 days';
  v_affected integer;
begin
  perform public.assert_event_deletion_admin(p_tenant_id, p_actor_id);

  if p_request_id is null or length(btrim(p_request_id)) = 0 then
    raise exception 'EVENT_DELETE_CONFLICT';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'EVENT_DELETE_REASON_REQUIRED';
  end if;
  if coalesce(array_length(p_unknown_dependencies, 1), 0) > 0 then
    raise exception 'EVENT_DELETE_IMPACT_INCOMPLETE';
  end if;

  select e.id, e.title, e.deleted_at, e.deletion_status, e.recoverable_until
  into v_event
  from public.events e
  where e.id = p_event_id
    and e.tenant_id = p_tenant_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if exists (
    select 1 from public.event_deletion_events de
    where de.tenant_id = p_tenant_id
      and de.event_id = p_event_id
      and de.event_status = 'SOFT_DELETED'
      and de.request_id = p_request_id
  ) then
    return jsonb_build_object(
      'event_id', p_event_id,
      'status', 'SOFT_DELETED',
      'deleted_at', v_event.deleted_at,
      'recoverable_until', v_event.recoverable_until,
      'idempotent', true
    );
  end if;

  if v_event.title is distinct from p_confirmation_title then
    raise exception 'EVENT_DELETE_TITLE_MISMATCH';
  end if;
  if v_event.deleted_at is not null then
    raise exception 'EVENT_DELETE_ALREADY_DELETED';
  end if;

  update public.events
  set deleted_at = v_now,
      deleted_by = p_actor_id,
      deletion_reason = btrim(p_reason),
      deletion_status = 'SOFT_DELETED',
      recoverable_until = v_recoverable_until,
      purge_scheduled_at = null,
      purged_at = null,
      updated_at = v_now
  where id = p_event_id
    and tenant_id = p_tenant_id
    and deleted_at is null;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'EVENT_DELETE_CONFLICT'; end if;

  insert into public.event_deletion_events
    (tenant_id, event_id, event_status, actor_id, request_id, metadata)
  values
    (p_tenant_id, p_event_id, 'DELETION_REQUESTED', p_actor_id, p_request_id,
     jsonb_build_object('reason_category', 'USER_REQUEST', 'derived_data_policy', 'EXCLUDE_WHILE_EVENT_INACTIVE')),
    (p_tenant_id, p_event_id, 'SOFT_DELETED', p_actor_id, p_request_id,
     jsonb_build_object('recoverable_until', v_recoverable_until, 'derived_data_policy', 'RECALCULATE_ACTIVE_UNIVERSE'));

  insert into public.audit_log
    (tenant_id, user_id, request_id, event_type, entity_type, entity_id, route, method, metadata)
  values
    (p_tenant_id, p_actor_id, p_request_id, 'event.deletion_requested', 'event', p_event_id,
     '/api/events/:eventId/delete-request', 'POST', jsonb_build_object('derived_data_policy', 'RECALCULATE_ACTIVE_UNIVERSE')),
    (p_tenant_id, p_actor_id, p_request_id, 'event.soft_deleted', 'event', p_event_id,
     '/api/events/:eventId/delete-request', 'POST',
     jsonb_build_object('recoverable_until', v_recoverable_until, 'derived_data_policy', 'RECALCULATE_ACTIVE_UNIVERSE'));

  return jsonb_build_object(
    'event_id', p_event_id,
    'status', 'SOFT_DELETED',
    'deleted_at', v_now,
    'recoverable_until', v_recoverable_until,
    'idempotent', false,
    'derived_data_policy', 'RECALCULATE_ACTIVE_UNIVERSE'
  );
end;
$$;

revoke all on function public.request_event_soft_delete(uuid, uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.request_event_soft_delete(uuid, uuid, uuid, text, text, text, text[]) to service_role;

comment on function public.request_event_soft_delete(uuid, uuid, uuid, text, text, text, text[]) is
  'Recoverable event exclusion. Derived SERA actions and risk aggregates are not destroyed; active queries recalculate from events.deleted_at is null, so delete/restore is dynamically reflected.';
