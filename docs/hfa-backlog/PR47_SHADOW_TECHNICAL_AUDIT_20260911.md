# PR #47 — Technical audit (2026-09-11)

PR: https://github.com/isaeldaumas/HFA/pull/47  
Branch: `feat/shadow-preactivation-divergence-v1`  
Base: `main` @ `a71d24464e4f3475d71de3d6d4016d9ed9e13ed8`

## Verdict

```text
PR_47_TECHNICAL_AUDIT=PASS
MAIN_MERGE_PRODUCTION_DEPLOY=UNKNOWN
MERGE_AUTHORIZED=NO  # blocked by UNKNOWN deploy risk + authorial gates still open for #13 closure
```

## Checklist (code-verified)

| Condition | Result |
|-----------|--------|
| Shadow disabled by default (`readBooleanEnv` === `'true'` only) | PASS |
| No Shadow flag set true in PR / CI env | PASS |
| No automatic activation | PASS |
| Normal flow: `complete-sera-analysis` only calls shadow inside `if (isShadowExecutionEnabled())`; runner returns `SKIPPED_DISABLED` | PASS |
| No production deploy scripts in PR | PASS |
| No migrations in PR | PASS |
| No D3 methodological decision embedded | PASS (docs mark AUTHOR_PENDING) |
| No D4 ratification embedded | PASS |
| ERC excluded from comparison (`ercIncluded: false`, excluded fields) | PASS |
| P/O/A comparison literal only | PASS |
| Literal equality not claimed as semantic equivalence | PASS (notes forbid; trial 002) |
| UNRESOLVED / absent / non-CLASSIFIED out of denominator; `agreementRate` null if denom 0 | PASS |
| Pre-V1 metrics not reinterpreted as V1 without rebuild rules | PASS (rebuild uses axis legacy when present; else excludes) |
| Admin endpoint: `requireAdmin` + flag gate → 404 | PASS |
| Admin queries tenant-scoped (`listShadowResultsForTenant`) | PASS |
| No raw narrative in admin comparisons payload | PASS |
| Rollback helpers force all flags false / fail-closed | PASS |
| Relevant tests green (local + PR checks) | PASS |

## MAIN_MERGE_PRODUCTION_DEPLOY evidence

| Channel | Finding |
|---------|---------|
| `.github/workflows/*` on `push` to `main` | **CI only** (HFA Core CI + SERA vNext Deterministic Regression). Integrated regression is `workflow_dispatch` only. **No deploy job.** |
| GitHub Environments / Deployments API | empty / no recorded deployments |
| Repo `vercel.json` | present (Next.js build config) |
| `.vercel/project.json` | **absent** |
| `vercel` CLI | token invalid — cannot confirm Git→Production link |
| Historical docs | managed staging “not provisioned” in past records; does not prove absence of a live Vercel production project elsewhere |

```text
MAIN_MERGE_VIA_GITHUB_ACTIONS_DEPLOY=NO
MAIN_MERGE_VIA_VERCEL_GIT_INTEGRATION=UNKNOWN
MAIN_MERGE_PRODUCTION_DEPLOY=UNKNOWN
```

**Policy applied:** do **not** merge PR #47 while deploy coupling is UNKNOWN.

## Indirect changes reviewed

- Admin nav link only when `NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED=true` (default false).
- `run-shadow-analysis.ts` now attaches `divergenceContract` when execution is enabled (still gated).
- Docs-only gate matrices; no API product behavior change for risk-profile.

## Follow-up fix in this audit

Admin comparisons rebuild path now prefers `axisDivergences[].legacyCode` when `divergenceContract` V1 is absent, instead of always nulling legacy (still fail-closed when absent).
