create table if not exists public.event_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('INITIAL', 'RESIDUAL')),
  probability text not null check (probability in ('A', 'B', 'C', 'D', 'E')),
  severity integer not null check (severity between 1 and 5),
  risk_score integer not null check (risk_score between 1 and 25),
  risk_level text not null check (risk_level in ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO')),
  matrix_profile text not null default 'AIRTRUST_SGSO_5X5_V1',
  justification text,
  assessed_by uuid references public.users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_risk_event_time
  on public.event_risk_assessments (event_id, assessed_at desc);
create index if not exists idx_event_risk_tenant_level
  on public.event_risk_assessments (tenant_id, risk_level, assessed_at desc);
create index if not exists idx_event_risk_assessed_by
  on public.event_risk_assessments (assessed_by) where assessed_by is not null;
alter table public.event_risk_assessments enable row level security;

drop policy if exists event_risk_assessments_tenant_select on public.event_risk_assessments;
create policy event_risk_assessments_tenant_select on public.event_risk_assessments
for select to authenticated using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.tenant_id = event_risk_assessments.tenant_id
      and u.is_active = true
  )
);

alter table public.corrective_actions
  add column if not exists priority text not null default 'medium',
  add column if not exists owner_user_id uuid references public.users(id) on delete set null,
  add column if not exists category text;

alter table public.corrective_actions drop constraint if exists corrective_actions_priority_check;
alter table public.corrective_actions add constraint corrective_actions_priority_check
  check (priority in ('low', 'medium', 'high', 'critical'));
alter table public.corrective_actions drop constraint if exists corrective_actions_category_check;
alter table public.corrective_actions add constraint corrective_actions_category_check
  check (category is null or category in ('TREINAMENTO', 'PROCEDIMENTO', 'EQUIPAMENTO', 'SUPERVISAO', 'COMUNICACAO', 'OUTRO'));

alter table public.corrective_actions drop constraint if exists corrective_actions_action_kind_check;
alter table public.corrective_actions add constraint corrective_actions_action_kind_check
  check (action_kind is null or action_kind in ('CORRECTIVE_PREVENTIVE', 'INVESTIGATION', 'GENERAL_SAFETY'));

alter table public.corrective_actions drop constraint if exists corrective_actions_exactly_one_analysis_source;
alter table public.corrective_actions add constraint corrective_actions_source_contract_check
  check (
    num_nonnulls(analysis_id, sera_vnext_analysis_id) = 1
    or (
      analysis_id is null
      and sera_vnext_analysis_id is null
      and source_event_id is not null
      and action_kind = 'GENERAL_SAFETY'
    )
  );

alter table public.corrective_actions drop constraint if exists corrective_actions_current_precondition_traceability_check;
alter table public.corrective_actions add constraint corrective_actions_current_precondition_traceability_check
  check (
    (
      sera_vnext_analysis_id is null
      or (
        source_event_id is not null
        and precondition_id is not null
        and length(btrim(precondition_id)) > 0
        and precondition_category is not null
        and length(btrim(precondition_category)) > 0
        and action_kind in ('CORRECTIVE_PREVENTIVE', 'INVESTIGATION')
      )
    )
    and (action_kind <> 'GENERAL_SAFETY' or source_event_id is not null)
  );

create index if not exists idx_corrective_actions_source_event_id
  on public.corrective_actions (source_event_id) where source_event_id is not null;
create index if not exists idx_corrective_actions_owner_user_id
  on public.corrective_actions (owner_user_id) where owner_user_id is not null;
create index if not exists idx_corrective_actions_tenant_priority_due
  on public.corrective_actions (tenant_id, priority, due_date) where status in ('pending', 'in_progress');
