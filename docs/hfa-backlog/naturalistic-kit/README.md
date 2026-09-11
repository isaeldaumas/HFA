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
| `../../../../tests/hfa-audit/naturalistic/validate-naturalistic-kit-structure.ts` | Structural validator |

## Forbidden

- Inventing cases, reviewers, labels, Kappa, thresholds, or PASS
- Converting structural OK into `ENGINE_NATURALISTIC_VALIDATION_PASS`
