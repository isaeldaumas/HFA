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
| `schemas/case-manifest.schema.json` | Case list metadata (IDs only; no fabricated cases) |
| `schemas/human-reference.schema.json` | Separated human reference labels |
| `schemas/blind-evaluator-form.schema.json` | Blind form capture |
| `schemas/vnext-output-capture.schema.json` | Engine output snapshot metadata |
| `schemas/adjudication-log.schema.json` | Adjudication log shape |
| `templates/*.md` | Empty templates for humans to fill later |
| `fixtures/TEST_*.json` | **Tooling-only** synthetic pairs (`scientificUse:false`) |
| `../../../../tests/hfa-audit/naturalistic/validate-naturalistic-kit-structure.ts` | Structural validator |
| `../../../../tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts` | Descriptive stats / Kappa when applicable |

## Operator workflow (when humans/cases exist)

1. Add real case IDs to a manifest JSON conforming to `case-manifest.schema.json` (status stays `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`).
2. Seal human reference separately (`human-reference.schema.json`); never share with blind evaluators.
3. Collect blind forms; capture vNext outputs by reference (avoid embedding raw narratives unless authorized).
4. Log adjudication decisions.
5. Build descriptive pair JSON (`NATURALISTIC_DESCRIPTIVE_PAIR_V1`) with `scientificUse:true` only for authorized real pairs.
6. Run descriptive analysis script; interpret offline with author thresholds — script will not PASS the gate.

```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/validate-naturalistic-kit-structure.ts
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts \
  --input docs/hfa-backlog/naturalistic-kit/fixtures
```

```text
NATURALISTIC_TOOLING=READY
HUMAN_VALIDATION=NOT_STARTED
PRODUCT_AUTHORIZATION=NOT_AUTHORIZED
ENGINE_NATURALISTIC_VALIDATION_NOT_READY
```

## Forbidden

- Inventing cases, reviewers, labels, thresholds, or methodological PASS
- Treating `TEST_*` fixtures as scientific evidence
- Converting structural/tooling OK into `ENGINE_NATURALISTIC_VALIDATION_PASS`
