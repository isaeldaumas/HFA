# Matriz de Rastreabilidade

Situações: `implementado_comprovado`, `implementado_parcial`, `implementado_divergente`,
`nao_implementado`, `nao_testado`, `teste_insuficiente`, `ambiguo`, `comportamento_adicional`,
`nao_aplicavel`.

"RT prod" = runtime de produção (`frontend/src/lib/sera/`). "vNext" = motor candidate-only.

| ID | Requisito | Fonte | Código responsável | Interface | Banco | Teste | Situação | Achado |
|---|---|---|---|---|---|---|---|---|
| R-01 | 12 falhas ativas canônicas | Hendy p.11 | `sera-vnext/canonical-codes.ts`; `sera/failure-names.ts` | flow-renderer | `analyses.*_code` | `canonical-codes-trial-001` | implementado_comprovado (vNext) / implementado_divergente (RT prod) | F-02, F-07 |
| R-02 | 4 níveis (falha/pré-condição/org/CCS) | Hendy p.12 | `sera/preconditions.ts`; `risk-profile/server.ts` | risk-profile | `analyses.preconditions` | parcial | implementado_parcial | F-09 |
| R-03 | STEP 1 escape point | Hendy p.69 + L-03 | `sera-vnext/escape-point-*.ts`; `sera/pipeline.ts:700` | — | `safe_operation_escape_point` | `colgan-escape-point-reaudit` | implementado_comprovado (vNext) / implementado_parcial (RT prod) | F-02 |
| R-04 | STEP 2 três perguntas P/O/A | Hendy p.70 | `sera-vnext/canonical-tree.ts` | interview | canonical_tree_version | `canonical-tree-trial-001` | implementado_comprovado (vNext) / **nao_implementado (RT prod)** | F-02 |
| R-05 | STEPS 3–5 decision ladders | Hendy p.71–95 | `sera-vnext/canonical-tree/traverse-tree.ts` vs `sera/pipeline.ts:210–301` | — | — | traversal trials | implementado_comprovado (vNext) / **implementado_divergente (RT prod)** | F-02, F-13 |
| R-06 | Pré-condições (≥1, "muitas") | Hendy p.71 | `sera/pipeline.ts:1976–1997` | risk-profile | `analyses.preconditions` | — | implementado_divergente (corte em 5) | F-09 |
| R-07 | Ato inseguro de supervisor recursivo | Hendy p.71 | — | — | — | — | nao_implementado | — |
| R-08 | Risco conceitual, não validado | Hendy p.33 | `risk-profile/erc.ts`; `sera/pipeline.ts:285` | risk-profile card/trend | `analyses.erc_level` | `risk-*` trials | **implementado_divergente** (fórmula sem fonte) | F-04, F-05 |
| R-09 | MDC + SERA complementares | Daumas | — (SERA parcial; MDC não modelado) | interview | — | — | implementado_parcial | — |
| R-10 | Amostra pequena / limitações | Daumas | `sera/data-confidence.ts` | risk-profile | — | — | implementado_parcial | F-10 |
| L-01 | Só perguntas canônicas conduzem P/O/A | S3 | vNext ✓ / RT prod ✗ | — | — | canonical trials | implementado_divergente (RT prod) | F-02 |
| L-02 | Evidência insuficiente ⇒ UNRESOLVED | S3 | `run-evidence-traversal.ts:83` ✓ / `pipeline.ts` ✗ | — | — | — | implementado_comprovado (vNext) / **nao_implementado (RT prod)** | F-03 |
| L-03 | Escape point "quando…" sem causa | S3 + skill | `escape-point-enforcement.ts` | — | escape point col | escape trials | implementado_comprovado (vNext) | — |
| L-04 | P/O/A no escape point | A4R137 | vNext | — | — | reaudit trials | implementado_comprovado (vNext) | — |
| L-05 | O-E NON_EXISTENT | skill | `canonical-codes.ts:38` | — | — | `canonical-code-enforcement` | implementado_comprovado | — |
| L-06 | proposedCode ≠ releasedCode | S3 | `sera-vnext-product/statuses.ts`, `transitions.ts` | admin | `*_candidate_code` | `code-release-gate-trial` | implementado_comprovado | — |
| L-07 | Sem downstream/HFACS/risk sem governança | S3 | flag-gated; porém RT prod gera ERC/HFACS | risk-profile, hfacs | — | — | **implementado_divergente** (RT prod gera risco/HFACS) | F-04, F-05, F-06 |
| ISO | Isolamento multi-tenant | Seção 4 | app-layer ✓ / RLS ✗ | — | RLS policies | `staging-tenant-isolation` (env) | implementado_parcial (RLS inoperante) | F-01 |
| NUM | Números reconciliáveis | Seção 5 | `risk-profile/server.ts`, `risk-quality-trend.ts` | dashboard | `analyses` | — | **implementado_divergente** | F-04 |
| IA | IA separada/sugestão | Seção 3.8 | `sera/llm.ts`, `pipeline.ts` | — | — | — | implementado_parcial | F-13 |

## Lacunas de teste (teste_insuficiente / nao_testado)

- Não há teste que **falhe** se o RT prod emitir P-A/O-A/A-A por falta de evidência (F-03).
- Não há teste de reconciliação numérica card↔trend↔banco para ERC (F-04).
- Isolamento de tenant depende de trials `REAL_DB`/`REAL_API` que exigem Supabase real (43
  trials pulados nesta execução por falta de ambiente) — RLS nunca é exercida com JWT real
  contra a função `get_tenant_id` (F-01).
