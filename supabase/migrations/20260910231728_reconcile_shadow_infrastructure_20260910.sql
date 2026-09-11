-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
-- Shadow feature flags remain disabled everywhere.
create table if not exists public.sera_vnext_shadow_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_analysis_id uuid null references public.analyses(id) on delete set null,
  legacy_event_id uuid null references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  shadow_run_id text not null,
  legacy_engine_version text null,
  vnext_engine_version text not null,
  vnext_methodology_version text not null,
  vnext_engine_output jsonb not null,
  divergence_summary jsonb not null default '{}'::jsonb,
  human_review_required boolean not null default true,
  generated_by_type text not null default 'deterministic_engine',
  validation_status text not null default 'not_validated',
  validated_at timestamptz null,
  validated_by text null,
  constraint sera_vnext_shadow_results_shadow_run_nonempty check (length(btrim(shadow_run_id)) > 0),
  constraint sera_vnext_shadow_results_generated_by_type_values check (generated_by_type in ('deterministic_engine','llm_suggestion','human_analyst','imported_legacy','migration','unknown_legacy')),
  constraint sera_vnext_shadow_results_validation_status_values check (validation_status in ('not_validated','pending_review','validated','rejected')),
  constraint sera_vnext_shadow_results_never_released check (validation_status <> 'validated' or validated_at is not null),
  constraint sera_vnext_shadow_results_tenant_run_unique unique (tenant_id, shadow_run_id)
);

create index if not exists idx_sera_vnext_shadow_results_tenant_created on public.sera_vnext_shadow_results (tenant_id, created_at desc);
create index if not exists idx_sera_vnext_shadow_results_legacy_analysis on public.sera_vnext_shadow_results (legacy_analysis_id) where legacy_analysis_id is not null;
create index if not exists idx_sera_vnext_shadow_results_legacy_event on public.sera_vnext_shadow_results (legacy_event_id) where legacy_event_id is not null;

alter table public.sera_vnext_shadow_results enable row level security;
revoke all privileges on table public.sera_vnext_shadow_results from public, anon, authenticated;
revoke all privileges on table public.sera_vnext_shadow_results from service_role;
grant select, insert on table public.sera_vnext_shadow_results to service_role;

create or replace function private.prevent_sera_vnext_shadow_results_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'sera_vnext_shadow_results_is_append_only';
end;
$$;
revoke execute on function private.prevent_sera_vnext_shadow_results_mutation() from public, anon, authenticated;

drop trigger if exists trg_prevent_sera_vnext_shadow_results_update on public.sera_vnext_shadow_results;
create trigger trg_prevent_sera_vnext_shadow_results_update before update on public.sera_vnext_shadow_results for each row execute function private.prevent_sera_vnext_shadow_results_mutation();
drop trigger if exists trg_prevent_sera_vnext_shadow_results_delete on public.sera_vnext_shadow_results;
create trigger trg_prevent_sera_vnext_shadow_results_delete before delete on public.sera_vnext_shadow_results for each row execute function private.prevent_sera_vnext_shadow_results_mutation();

comment on table public.sera_vnext_shadow_results is 'Staging shadow candidate results. Service-role-only direct access; append-only; never production output. Shadow feature flags remain disabled.';
