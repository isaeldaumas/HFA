# HFA / SERA vNext — Final Promotion Gate Matrix (2026-09-12)

**Repository:** `isaeldaumas/HFA`  
**Baseline:** `main @ bddf2e9e7b33abfee1d3d5db722d0ead33cc7bed`  
**Status:** `PRODUCTION_NOT_AUTHORIZED`

This file supersedes the 2026-09-11 promotion matrix as the current gate snapshot. The older file is retained as historical evidence.

## Gate matrix

| Gate | State | Current evidence / note |
|---|---|---|
| D3 / ERC | PASS | Author decision recorded as `D3_B_APPROVED_IMPLEMENTED`; no canonical numeric ERC for vNext; legacy ERC preserved with provenance; UNRESOLVED does not create ERC. |
| D4 / taxonomy | PASS | `D4_RATIFICATION=AUTHOR_APPROVED`; `SERA_PT_CANONICAL_v1.0=AUTHORITATIVE`; no semantic rewrite required. |
| Taxonomy alignment | PASS | Post-PR #50 canonical audit + deterministic semantic guards green. |
| Tree semantic alignment | PASS | Canonical P/O/A traversal and reachability green. |
| Runtime implementation alignment | PASS | PR #50 + V3 precision/recall remediation; no final-output release. |
| Perception branch audit | PASS_TECHNICAL | V3 naturalistic precision/recall controls: CAL-01→P-B, CAL-04→P-C, VAL-02→P-B plus negative controls. |
| Objective branch audit | PASS_TECHNICAL | O-A/O-C/O-D boundaries aligned; O-E remains non-existent/forbidden. |
| Action branch audit | PASS_TECHNICAL | A-B/A-C, A-F/A-I, A-G/A-J boundaries aligned; VAL-01→A-B confirmed. |
| Required CI | PASS | Post-merge HFA Core CI and SERA vNext Deterministic Regression green on `bddf2e9`. |
| V04 validation tooling | READY | Per-axis `CODE / UNRESOLVED / NOT_SCORED`, exposure ledger, blind forms, sealed-holdout template and descriptive analyzer merged in PR #53. |
| Naturalistic human validation | BLOCKED_HUMAN | No eligible independent sealed-holdout corpus and no blind human reviewer roster currently available. Existing V03 and A4R78/A4R193 cohorts are development-exposed and ineligible for scientific holdout. |
| Scientific validation | NOT_READY | Requires independent real cases, blind human reviewers, locked references, adjudication and author interpretation of metrics. |
| Shadow observability | NOT_READY | Shadow flags remain OFF; no real observation period started. |
| Shadow rollback | PASS | Rollback helpers/trials preserved. |
| External endpoint audit | BLOCKED_EXTERNAL | Requires production/staging telemetry + non-repo consumer inventory. |
| Product authorization | NOT_AUTHORIZED | Technical/tooling readiness does not imply product authorization. |
| Production authorization | NOT_READY | Requires remaining human/external gates plus explicit author production authorization. |

## Absolute locks in force

```text
PRODUCTION_NOT_TOUCHED
NO_PRODUCTION_DEPLOY
SHADOW_FLAGS_OFF
NO_GATE_BYPASS
NO_FABRICATED_VALIDATION
selectedCode=null
releasedCode=null
finalConclusion=null
classifiedOutput=false
readyPromotion=false
downstreamAllowed=false
humanReviewRequired=true
```

## Current technical evidence

### V3 runtime closure

- CAL-01 → P-B: PASS
- CAL-04 → P-C: PASS
- VAL-01 → A-B: PASS
- VAL-02 → P-B: PASS
- precision negative controls for night/fog/training: PASS
- V02 reachability: 22/22 positive + 22/22 negative leaves
- V02 full: 103 cases; classification accuracy / leaf coverage / PT-EN parity / determinism = 1
- deterministic regression after V3: 165/165 PASS
- TypeScript: PASS
- lint: 0 errors; 24 pre-existing warnings
- build: PASS

### V04 tooling closure

- PR #53 merged to `main`
- V04 structure: `V04_STRUCTURE_OK`
- per-axis contract: READY
- development-exposure ledger: READY
- scientific fixtures: 0 fabricated cases
- deterministic regression with V04 gates: 165 PASS + 2 expected `NOT_READY`, 0 FAIL, 0 timeout
- post-merge HFA Core CI: SUCCESS
- post-merge SERA vNext Deterministic Regression: SUCCESS

## What still blocks a production claim

1. Select and authorize a genuinely independent real-event cohort not exposed to runtime/oracle development.
2. Lock source/narrative hashes before engine execution.
3. Recruit at least two pseudonymous blind human evaluators with authorization/ethics note.
4. Collect independent P/O/A assessments under the V04 per-axis contract.
5. Freeze human reference/adjudication before comparing with engine output.
6. Run V04 descriptive metrics and classify every disagreement as engine bug, stale oracle, insufficient evidence, canonical ambiguity, or rater disagreement.
7. Obtain explicit author decision on interpretation thresholds/results.
8. If shadow is desired, separately authorize non-production shadow enablement and observation period.
9. Complete external endpoint/consumer audit using production/staging telemetry.
10. Only then consider an explicit production authorization decision.

## Current final statuses

```text
TAXONOMY_ALIGNMENT=PASS
TREE_SEMANTIC_ALIGNMENT=PASS
RUNTIME_IMPLEMENTATION_ALIGNMENT=PASS
LEGACY_ALIGNMENT=PASS
PERCEPTION_BRANCH_AUDIT=PASS_TECHNICAL
OBJECTIVE_BRANCH_AUDIT=PASS_TECHNICAL
ACTION_BRANCH_AUDIT=PASS_TECHNICAL
FULL_REGRESSION_STATUS=PASS
V04_VALIDATION_TOOLING=READY
NATURALISTIC_VALIDATION_STATUS=BLOCKED_HUMAN
SCIENTIFIC_VALIDATION_STATUS=NOT_READY
SHADOW_OBSERVABILITY_STATUS=NOT_READY
EXTERNAL_ENDPOINT_AUDIT=BLOCKED_EXTERNAL
PRODUCTION_ACTIVATION_STATUS=NOT_AUTHORIZED
```
