# HFA / SERA vNext — Final Promotion Gate Matrix (2026-09-11)

Status: **PRODUCTION_NOT_AUTHORIZED**  
Prepared from continuation work after `main` @ `a71d24464e4f3475d71de3d6d4016d9ed9e13ed8`.  
Updated after PR #47 technical audit: `MAIN_MERGE_PRODUCTION_DEPLOY=UNKNOWN` (see `PR47_SHADOW_TECHNICAL_AUDIT_20260911.md`).

## Gate matrix

| Gate | State | Evidence / note |
|------|-------|-----------------|
| D3 | AUTHOR_DECISION_PENDING | D3-b proposal ready technically; no explicit author approval text recorded |
| D4 | AUTHOR_DECISION_PENDING | Runtime/taxonomy technically aligned; author ratification of `SERA_PT_CANONICAL_v1.0` AUTHORITATIVE still pending |
| JWT/RLS | PASS | Tenant isolation contract + prior READ_ONLY/MUTATING integrated evidence on main |
| cross-tenant staging | PASS | Covered by tenant-isolation contract / prior mutating staging validation on main |
| naturalistic validation | NOT_READY | `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`; no fabricated human labels |
| shadow observability | NOT_READY | Preparatory divergence contract landed; all `SERA_SHADOW_*=false`; no activation |
| shadow rollback | PASS | Trial 003 + documented rollback helpers (flags remain OFF) |
| external endpoint audit | BLOCKED_EXTERNAL | Repo consumer audit done; Vercel/telemetry 90d blocked (no `.vercel/project.json` / observability access) |
| required CI checks | PASS | Local: tsc, lint, build, mandatory trials, deterministic regression CI_PASS |
| author approval | AUTHOR_DECISION_PENDING | Required for D3, D4, shadow enablement, endpoint removal, production |
| production authorization | NOT_READY | Explicitly not authorized; CI green ≠ production auth |
| main merge → production deploy | NO | Evidence: `MAIN_MERGE_PRODUCTION_DEPLOY_EVIDENCE_20260911.md` (isaeldaumas/HFA has no Vercel Git link; production is on `system-hfa/HFA`) |

## Absolute locks (still in force)

```text
PRODUCTION_NOT_TOUCHED
NO_PRODUCTION_DEPLOY
SHADOW_FLAGS_OFF
NO_GATE_BYPASS
NO_FABRICATED_VALIDATION
```

## What would flip a gate

- **D3 → PASS**: explicit author approval of D3-b (or alternate) + merged implementation + ERC containment green.
- **D4 → PASS**: explicit author ratification of canonical taxonomy authority + no semantic rewrite.
- **naturalistic → PASS**: real cases + real blind human evaluators + adjudication log + author threshold decision (script alone cannot PASS).
- **shadow observability → PASS**: author enablement of Shadow flags in non-prod with telemetry plan (not implied by preparatory PR).
- **external endpoint audit → PASS/FAIL**: 90d production/staging telemetry + human inventory of non-repo consumers.
- **production authorization → PASS**: all required gates PASS + explicit author production authorization (never inferred).
