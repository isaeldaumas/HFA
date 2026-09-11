# Shadow Mode — Pre-activation technical delta (issue #13)

**Status**: `SHADOW_TECHNICAL_DELTA_PREPARED` · `SHADOW_FLAGS_OFF`  
**Contract**: `SERA_SHADOW_DIVERGENCE_V1`  
**Created**: 2026-09-11  
**Pack note**: zip packs were not present on the local machine; this delta implements the
specified preparatory scope from the continuation brief.

---

## Hard locks

```text
SERA_SHADOW_EXECUTION_ENABLED=false
SERA_SHADOW_PERSISTENCE_ENABLED=false
SERA_SHADOW_ADMIN_VIEW_ENABLED=false
SERA_SHADOW_AUTO_COMPARISON_ENABLED=false
SERA_SHADOW_VALIDATION_REPORTS_ENABLED=false
```

- No production deploy
- No migration in this delta
- No Shadow activation
- ERC excluded from comparison
- Literal P/O/A code equality only (not semantic equivalence)
- D3/D4 remain unresolved authorially
- Naturalistic validation remains `NOT_READY`

## Delivered technically

| Item | Location |
|------|----------|
| Divergence contract V1 | `frontend/src/lib/sera-shadow/divergence-v1.ts` |
| Wired into shadow runner summary | `frontend/src/lib/sera-shadow/run-shadow-analysis.ts` |
| Rollback/kill-switch helpers | `frontend/src/lib/sera-shadow/rollback.ts` |
| Admin read-only API (404 when flag off) | `frontend/src/app/api/admin/sera-shadow/comparisons/route.ts` |
| Admin read-only UI (fail-closed) | `frontend/src/app/(dashboard)/admin/sera-shadow/comparisons/page.tsx` |
| Comparison trial | `tests/hfa-audit/shadow-mode/shadow-mode-trial-002-comparison.ts` |
| Rollback trial | `tests/hfa-audit/shadow-mode/shadow-mode-trial-003-rollback.ts` |
| Core CI hooks | `.github/workflows/hfa-core-ci.yml` |

## Contract rules (V1)

1. Compare only perception/objective/action codes.
2. Include an axis in the denominator only when vNext status is `CLASSIFIED` and both codes are present (non-empty, not UNRESOLVED).
3. `exactTripletMatch` requires all three axes comparable and literally equal.
4. `agreementRate` is `null` when denominator is 0 (never coerced to 0).
5. ERC / risk fields are never compared.

## Remaining gates before any flag can turn on

See `SHADOW_MODE_PRE_ACTIVATION_GATES.md`:
- naturalistic `VALIDATION_PASS` (still `NOT_READY`)
- formal author authorization for Shadow
- staging validation window

This PR is preparatory issue #13 work only.
