# Author decisions recorded — D3-b + D4 (2026-09-11)

## D3 — APPROVED as D3-b

Author text received and implemented in code (risk-profile / data-confidence / containment).

```text
D3=D3_B_APPROVED_IMPLEMENTED
```

Locks preserved:

- no new ERC formula / weights / thresholds invented;
- no Shadow enablement;
- no production authorization;
- deprecated `/api/analyses/risk-profile` retained (delegates to canonical builder; behavior follows D3-b via shared service).

## D4 — RATIFIED

```text
D4_TECHNICAL_ALIGNMENT=PASS
D4_IMPLEMENTATION_CHANGE_REQUIRED=NO
D4_RATIFICATION=AUTHOR_APPROVED
SERA_PT_CANONICAL_v1.0=AUTHORITATIVE
```

No semantic taxonomy rewrite in this change set.

## Explicit non-authorizations (unchanged)

```text
SHADOW_FLAGS_OFF
SHADOW_REAL_OBSERVATION_PERIOD=NOT_STARTED
NATURALISTIC=ENGINE_NATURALISTIC_VALIDATION_NOT_READY
PRODUCTION_AUTHORIZATION=NOT_AUTHORIZED
ENDPOINT_REMOVAL=NOT_AUTHORIZED
```
