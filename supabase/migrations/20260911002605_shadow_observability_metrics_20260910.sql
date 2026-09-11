-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
-- Historical intermediate view (incorrect validation_status labels). Superseded by 20260911002855.
create or replace view public.sera_vnext_shadow_metrics
with (security_invoker = true)
as
select
  tenant_id,
  count(*)::bigint as total_runs,
  count(*) filter (where validation_status <> 'NOT_REVIEWED')::bigint as reviewed_runs,
  count(*) filter (where validation_status = 'REVIEWED_MATCH')::bigint as reviewed_match,
  count(*) filter (where validation_status = 'REVIEWED_PARTIAL')::bigint as reviewed_partial,
  count(*) filter (where validation_status = 'REVIEWED_DIVERGENT')::bigint as reviewed_divergent,
  count(*) filter (where human_review_required)::bigint as human_review_required_runs,
  case
    when count(*) filter (where validation_status <> 'NOT_REVIEWED') = 0 then null
    else round(
      100.0 * count(*) filter (where validation_status = 'REVIEWED_MATCH')
      / count(*) filter (where validation_status <> 'NOT_REVIEWED'),
      2
    )
  end as exact_match_pct,
  case
    when count(*) filter (where validation_status <> 'NOT_REVIEWED') = 0 then null
    else round(
      100.0 * count(*) filter (where validation_status in ('REVIEWED_MATCH','REVIEWED_PARTIAL'))
      / count(*) filter (where validation_status <> 'NOT_REVIEWED'),
      2
    )
  end as acceptable_agreement_pct,
  min(created_at) as first_shadow_at,
  max(created_at) as last_shadow_at
from public.sera_vnext_shadow_results
group by tenant_id;

revoke all privileges on table public.sera_vnext_shadow_metrics from public, anon, authenticated;
grant select on table public.sera_vnext_shadow_metrics to service_role;

comment on view public.sera_vnext_shadow_metrics is
  'Passive pre-activation shadow observability. No shadow execution is enabled by this view; service-role-only.';
