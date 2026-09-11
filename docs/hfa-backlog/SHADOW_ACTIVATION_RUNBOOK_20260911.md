# Shadow Mode — operational activation runbook (DO NOT EXECUTE without author approval)

Status: **NOT EXECUTED** · `SHADOW_FLAGS_OFF` · `SHADOW_REAL_OBSERVATION_PERIOD=NOT_STARTED`

This document prepares a future authorized activation. It does **not** authorize activation.

## Preconditions (all required)

```text
D3=PASS (D3_B_APPROVED_IMPLEMENTED)
D4=PASS (SERA_PT_CANONICAL_v1.0 AUTHORITATIVE)
NATURALISTIC=<gate required by author protocol; currently NOT_READY>
OBSERVABILITY_INFRA=PASS
ROLLBACK=PASS
AUTHOR_APPROVAL=PASS (explicit written authorization for Shadow period)
ENVIRONMENT=staging/dev only until separate production authorization
```

```text
SHADOW_OBSERVATION_MINIMUM=AUTHOR_DECISION_PENDING
```

Do **not** invent duration, sample size, or agreement thresholds here. Author must decide:

- observation duration (if any);
- minimum case/run count (if any);
- exit criteria for the period;
- whether naturalistic human gate is a hard precondition for staging Shadow.

## Activation order (staging/dev only — when authorized)

1. Confirm all `SERA_SHADOW_*=false` currently.
2. Author written approval recorded (issue comment / signed note).
3. Enable **only** `SERA_SHADOW_EXECUTION_ENABLED=true` first.
4. Prove activation: shadow path no longer returns only `SKIPPED_DISABLED` for a **synthetic fixture tenant** (never production users without consent/LGPD).
5. If persistence authorized separately: `SERA_SHADOW_PERSISTENCE_ENABLED=true`.
6. If admin view authorized separately: `SERA_SHADOW_ADMIN_VIEW_ENABLED=true` **and** `NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED=true`.
7. Auto-comparison / validation-report flags only if explicitly authorized later.

User-facing product path must continue to return **legacy** results only. Shadow never substitutes production output.

## What to observe (no ERC)

Via `SERA_SHADOW_DIVERGENCE_V1` / admin comparisons (when enabled):

- volume of comparisons;
- comparable axes P / O / A;
- literal agreement and divergences per axis;
- exact triplet match;
- UNRESOLVED / non-CLASSIFIED exclusions from denominator;
- engine errors / unsupported summary versions;
- persistence failures;
- tenant anomalies.

## Rollback (< 5 minutes target)

Responsible: on-call / author designee named in the activation approval.

1. Set all `SERA_SHADOW_*` (and `NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED`) to `false` / unset.
2. Restart/redeploy process so env is re-read.
3. Verify `assertShadowFullyDisabled() === true` (or run `shadow-mode-trial-003-rollback.ts` harness).
4. Verify `/api/admin/sera-shadow/comparisons` → 404.
5. Verify `runShadowVNextIfEnabled` → `SKIPPED_DISABLED` without Supabase touch.
6. Record evidence (timestamps, env snapshot boolean flags only — no narratives).

Source: `frontend/src/lib/sera-shadow/rollback.ts`.

## Explicit non-goals of this runbook

- No production deploy
- No production flag flip
- No merge of this doc as activation
- No duration/threshold invention
