# HFA / SERA vNext — Final gate matrix (updated 2026-09-11)

```text
MAIN_SHA=a71d24464e4f3475d71de3d6d4016d9ed9e13ed8
PR_47_HEAD=<see git; expected f41a36d + follow-up commits on branch>
MAIN_MERGE_PRODUCTION_DEPLOY=NO
```

Evidence: `MAIN_MERGE_PRODUCTION_DEPLOY_EVIDENCE_20260911.md`.

| Gate | State |
|------|-------|
| D3 | AUTHOR_PENDING |
| D4 technical alignment | PASS |
| D4 ratification | AUTHOR_PENDING |
| Shadow tenant isolation | PASS |
| Shadow technical integrity | PASS |
| Shadow observability infra | PASS |
| Shadow real observation period | NOT_STARTED |
| Shadow rollback | PASS |
| Shadow author approval | AUTHOR_PENDING |
| Naturalistic tooling | READY |
| Naturalistic human validation | NOT_STARTED |
| Endpoint repo audit | PASS |
| Endpoint 90d telemetry | BLOCKED_EXTERNAL |
| Endpoint external consumer inventory | NOT_STARTED |
| Production authorization | NOT_AUTHORIZED |

```text
PRODUCTION_NOT_TOUCHED
NO_PRODUCTION_DEPLOY
SHADOW_FLAGS_OFF
NO_GATE_BYPASS
NO_FABRICATED_VALIDATION
```
