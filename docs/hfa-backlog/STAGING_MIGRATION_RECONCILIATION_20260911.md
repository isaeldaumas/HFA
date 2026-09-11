# Staging migration reconciliation (2026-09-11)

## Purpose

Version in GitHub the migrations that were already applied on authorized staging
Supabase project `vbdpweliprcsktyxodss` after `20260910193000`, so repo history
matches staging migration parity.

## Rule

```text
VERSIONED_IN_GITHUB_ONLY
DO_NOT_REAPPLY_ON_SAME_STAGING
PRODUCTION_NOT_TOUCHED
SHADOW_FLAGS_OFF
```

These files reconstruct the exact SQL stored in
`supabase_migrations.schema_migrations.statements` on staging.

## Versions reconciled

| Version | Name | Notes |
| ------- | ---- | ----- |
| 20260910230820 | harden_sera_document_uploads_service_role_only | revoke browser roles |
| 20260910231118 | add_missing_fk_indexes_20260910 | FK covering indexes |
| 20260910231149 | optimize_rls_auth_initplans_20260910 | `(select auth.uid())` initplan form |
| 20260910231728 | reconcile_shadow_infrastructure_20260910 | service_role-only append-only shadow table |
| 20260911002605 | shadow_observability_metrics_20260910 | intermediate metrics view (historical) |
| 20260911002727 | tighten_shadow_metrics_view_grants_20260910 | service_role SELECT-only |
| 20260911002758 | noop_do_not_apply | historical no-op (`select 1;`); no schema/data effect; retained for migration parity |
| 20260911002855 | correct_shadow_observability_metrics_20260910 | corrected status labels; no agreement-rate inference |

## Shadow state required (flags remain false)

```text
SERA_SHADOW_EXECUTION_ENABLED=false
SERA_SHADOW_PERSISTENCE_ENABLED=false
SERA_SHADOW_ADMIN_VIEW_ENABLED=false
SERA_SHADOW_AUTO_COMPARISON_ENABLED=false
SERA_SHADOW_VALIDATION_REPORTS_ENABLED=false
```

Verified staging properties at reconciliation time:

- `sera_vnext_shadow_results`: RLS ON, no browser policies, service_role SELECT+INSERT only
- append-only triggers on UPDATE/DELETE
- UNIQUE `(tenant_id, shadow_run_id)`
- zero rows
- `sera_vnext_shadow_metrics`: service_role SELECT-only; no agreement percentage columns

## Advisors residual (staging free tier)

- `auth_leaked_password_protection`: `KNOWN_STAGING_FREE_TIER_LIMITATION` — do not create paid cost
- `rls_enabled_no_policy` INFO on service-role-only tables is intentional fail-closed posture
