# Shadow observability infrastructure (#13)

```text
SHADOW_OBSERVABILITY_INFRA=PASS
SHADOW_REAL_OBSERVATION_PERIOD=NOT_STARTED
```

Flags remain OFF. This documents **infra readiness**, not an observation period.

## Available when flags authorized later

| Capability | Status | Location |
|------------|--------|----------|
| Versioned comparison contract | PASS | `sera-shadow/divergence-v1.ts` |
| Per-run axis comparable / diverge / agree | PASS | contract result |
| Exact triplet | PASS | `exactTripletMatch` |
| Aggregate metrics (runs, rates, `ercIncluded:false`) | PASS | `aggregateShadowDivergenceV1` |
| Unsupported / pre-V1 summary handling | PASS | admin rebuild from `axisDivergences` or exclude |
| Admin read-only API tenant-scoped | PASS | `/api/admin/sera-shadow/comparisons` (404 if flag off) |
| Admin dashboard (no raw narratives) | PASS | `admin/sera-shadow/comparisons` |
| Failures isolated from legacy path | PASS | `complete-sera-analysis` gated + runner catch |
| Live alerting / SLO dashboards | NOT_READY | not built; requires real observation period |
| Real Shadow traffic | NOT_STARTED | all `SERA_SHADOW_*=false` |

## Activation gate (unchanged)

`OBSERVABILITY=NOT_READY` for **Shadow enablement** until author approval + real observation period. Infra PASS ≠ period started.
