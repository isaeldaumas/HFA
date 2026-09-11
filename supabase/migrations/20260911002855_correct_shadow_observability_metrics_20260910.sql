-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
-- Corrects validation_status labels to match table CHECK constraint; removes premature agreement metrics.
drop view if exists public.sera_vnext_shadow_metrics;

create view public.sera_vnext_shadow_metrics
with (security_invoker = true)
as
select
  tenant_id,
  count(*)::bigint as total_runs,
  count(*) filter (where validation_status = 'not_validated')::bigint as not_validated_runs,
  count(*) filter (where validation_status = 'pending_review')::bigint as pending_review_runs,
  count(*) filter (where validation_status = 'validated')::bigint as validated_runs,
  count(*) filter (where validation_status = 'rejected')::bigint as rejected_runs,
  count(*) filter (where human_review_required)::bigint as human_review_required_runs,
  count(*) filter (
    where divergence_summary is not null
      and divergence_summary <> '{}'::jsonb
  )::bigint as runs_with_divergence_summary,
  min(created_at) as first_shadow_at,
  max(created_at) as last_shadow_at
from public.sera_vnext_shadow_results
group by tenant_id;

revoke all privileges on table public.sera_vnext_shadow_metrics from public, anon, authenticated, service_role;
grant select on table public.sera_vnext_shadow_metrics to service_role;

comment on view public.sera_vnext_shadow_metrics is
  'Passive pre-activation shadow operational metrics. Agreement metrics require a versioned divergence_summary comparison contract; this view does not infer agreement.';
