# Naturalistic validation kit — structural scaffolding only

Status: `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`

This kit prepares **forms, schemas, and structural validators**. It does **not** produce methodological PASS/FAIL.

## Separation (mandatory)

| Layer | Meaning | May this kit decide? |
|-------|---------|----------------------|
| TECHNICAL_VALIDATION | Schema/shape of artifacts | Yes (structure only) |
| SCIENTIFIC_VALIDATION | Method thresholds, Kappa interpretation | **No** — author |
| HUMAN_VALIDATION | Real blind reviewers + cases | **No** — humans |
| PRODUCT_AUTHORIZATION | Production / Shadow enablement | **No** — author |

## Files

| File | Purpose |
|------|---------|
| `schemas/descriptive-pair.schema.json` | Pair shape for descriptive analysis |
| `OPERATIONAL_RUNBOOK.md` | Full human-executable flow + blinding rules |
| `campaigns/_TEMPLATE/` | Empty campaign layout |
| `../../../../tests/hfa-audit/naturalistic/validate-naturalistic-kit-structure.ts` | Structural validator |
| `../../../../tests/hfa-audit/naturalistic/validate-naturalistic-campaign-layout.ts` | Blinding layout validator |
| `../../../../tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts` | Descriptive stats / Kappa when applicable |


## V04 per-axis protocol (preferred for new campaigns)

New campaigns should use `V04_PROTOCOL.md`, `schemas/*-v2.schema.json`, and `campaigns/_TEMPLATE_V04`. V04 keeps the V1 files for traceability but fixes the V03/V1 ambiguity between global abstention, axis-level `UNRESOLVED`, and `NOT_SCORED`.

V04 also enforces a development-exposure ledger: V03 and the A4R78/A4R193 cohorts are calibration/internal evidence only and are not eligible for a sealed scientific holdout.

```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/validate-naturalistic-v04-kit.ts
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/run-naturalistic-v04-descriptive-analysis.ts \
  --input docs/hfa-backlog/naturalistic-kit/fixtures
```

## Operator workflow (when humans/cases exist)

See `OPERATIONAL_RUNBOOK.md`. Short path:

1. Copy `campaigns/_TEMPLATE` → `campaigns/<campaignId>`.
2. Fill manifest with authorized real case IDs only.
3. Seal references before blind distribution.
4. Collect blind forms; capture vNext separately; adjudicate after unblind.
5. Build pairs with `scientificUse:true` only for authorized real pairs.
6. Run descriptive analysis — interpret offline; script will not PASS the gate.

```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/validate-naturalistic-kit-structure.ts
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/validate-naturalistic-campaign-layout.ts \
  --campaign docs/hfa-backlog/naturalistic-kit/campaigns/_TEMPLATE
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts \
  --input docs/hfa-backlog/naturalistic-kit/fixtures
```

```text
NATURALISTIC_TOOLING=READY
REAL_CASES=NOT_AVAILABLE
REAL_REVIEWERS=NOT_AVAILABLE
HUMAN_VALIDATION=BLOCKED_HUMAN
PRODUCT_AUTHORIZATION=NOT_AUTHORIZED
ENGINE_NATURALISTIC_VALIDATION_NOT_READY
```

## Forbidden

- Inventing cases, reviewers, labels, thresholds, or methodological PASS
- Treating `TEST_*` fixtures as scientific evidence
- Converting structural/tooling OK into `ENGINE_NATURALISTIC_VALIDATION_PASS`
## V04 sealed source lock

`V04_SEALED_001` now has a public cryptographic seal for 30 independent official-source cases.
Source identities and URLs remain outside the repository to reduce holdout contamination risk.
The public seal proves cohort identity/count; it does **not** mean human review or scientific validation has started.

Current state: `sealedHoldoutCases=30`, `humanValidation=BLOCKED_HUMAN`, `scientificValidation=NOT_RUN`.
