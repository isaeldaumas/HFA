# SERA vNext — Protocolo de Validação Naturalística

**Status**: `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`
**Tooling**: `NATURALISTIC_TOOLING=READY` (see `naturalistic-kit/OPERATIONAL_RUNBOOK.md`)
**V04 per-axis tooling**: `READY` for new campaigns; human/holdout execution remains blocked until real independent cases + reviewers exist.
**Restrição ativa**: `SHADOW_FLAGS_OFF` | `NO_PRODUCTION_VALIDATION` | `NO_FABRICATED_VALIDATION`

---

## Estado atual

| Camada | Estado |
|--------|--------|
| Tooling / schemas / scripts | READY |
| Casos humanos reais autorizados para cegamento | `NOT_AVAILABLE` |
| Avaliadores humanos | `NOT_AVAILABLE` |
| Validação humana | `BLOCKED_HUMAN` / `NOT_STARTED` |
| Gate metodológico | `ENGINE_NATURALISTIC_VALIDATION_NOT_READY` |
| Autorização de produto | `NOT_AUTHORIZED` |

Corpus `engine-validation-v03-naturalistic` = validação de motor, **não** substitui validação humana cega do issue #15.

## Fluxo executável

Ver `docs/hfa-backlog/naturalistic-kit/OPERATIONAL_RUNBOOK.md`:

CASE_SELECTION → REFERENCE_LOCK → BLINDING → HUMAN_REVIEW → VNEXT_EXECUTION → UNBLIND → ADJUDICATION → DESCRIPTIVE_ANALYSIS → AUTHOR/METHODOLOGICAL_DECISION

## Separação de validações

| Tipo | Pode o tooling decidir? |
|------|-------------------------|
| TECHNICAL_VALIDATION | Sim (estrutura) |
| SCIENTIFIC_VALIDATION | Não — autor |
| HUMAN_VALIDATION | Não — humanos |
| PRODUCT_AUTHORIZATION | Não — autor |

## Restrições

- Não fabricar casos, reviewers, labels, Kappa oficial, thresholds ou PASS
- Fixtures `TEST_*` apenas para tooling (`scientificUse:false`)
- Scripts descritivos nunca emitem `VALIDATION_PASS` / `PRODUCTION_READY` / `SHADOW_APPROVED`
