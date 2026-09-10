# Infraestrutura de Proveniência Metodológica

## Campos implementados (por análise/resultado derivado)

| Campo | `analyses` (legado) | `sera_vnext_analyses` | `sera_vnext_shadow_results` |
|---|---|---|---|
| `engine_id` | novo | novo | fixo (`vnext_engine_version` já existente cobre versão) |
| `engine_version` | já existia como `motor_version` (não duplicado) | já existia (travado por constraint) | `vnext_engine_version`/`legacy_engine_version` |
| `methodology_version` | novo | já existia (travado por constraint) | `vnext_methodology_version` |
| `taxonomy_version` | novo | novo | — |
| `risk_method_id` / `risk_method_version` | novo | novo (NULL — risco locked no vNext) | — |
| `generated_at` | novo | (`created_at` já cobre; não duplicado) | `created_at` |
| `generated_by_type` | novo | novo | novo (NOT NULL, default `deterministic_engine`) |
| `generated_by_id` | novo | novo | — |
| `validation_status` | novo | novo | novo (NOT NULL, default `not_validated`) |
| `validated_at` / `validated_by` | novo | novo | novo |
| `source_analysis_version` | novo | novo | — |

`generated_by_type` aceita exatamente: `deterministic_engine`, `llm_suggestion`,
`human_analyst`, `imported_legacy`, `migration`, `unknown_legacy` (CHECK constraint nas 3
tabelas). `validation_status` aceita: `not_validated`, `pending_review`, `validated`, `rejected`.

## Backfill de histórico (não reescreve classificação)

Para `analyses` (tabela **não** append-only, com histórico real): um único `UPDATE` popula
`generated_by_type='unknown_legacy'`, `generated_at=created_at`, `validation_status='not_validated'`,
`engine_id='SERA_LEGACY_ENGINE'`, `risk_method_id`/`version` (quando `erc_level` existe) e
`source_analysis_version='LEGACY_PRE_PROVENANCE'` — **apenas** nas linhas que já têm
`perception_code` (i.e., já tinham uma classificação persistida). Nenhuma coluna de
classificação (`perception_code`, `objective_code`, `action_code`, `erc_level`, `conclusions`,
etc.) é tocada.

Para `sera_vnext_analyses` (append-only por trigger): **nenhum backfill** — as novas colunas
ficam `NULL` em linhas históricas, porque a tabela literalmente não pode ser atualizada
(`prevent_sera_vnext_append_only_update`), e `NULL` é o valor honesto (proveniência não
rastreada no momento da criação daquelas linhas).

## Escrita para novas análises (daqui para frente)

- **Legado** (`buildAnalysisUpsertPayload`, `frontend/src/lib/sera/pipeline.ts`): `generated_by_type`
  é derivado de `trace_context` — `'llm_suggestion'` quando nenhum eixo precisou do fallback
  heurístico determinístico, `'deterministic_engine'` quando ao menos um eixo foi decidido pela
  heurística (`inferPerceptionCode`/`inferObjectiveCode`/`inferActionCode`). É uma aproximação
  documentada — o motor legado não rastreia a origem por eixo separadamente (achado F-13); não
  inventamos uma granularidade que a arquitetura atual não suporta.
- **vNext** (`createSeraVNextAnalysis`, `frontend/src/lib/sera-vnext-product/persistence/create-analysis.ts`):
  sempre `'deterministic_engine'` porque o engine-v0 roda com `allowLlm: false` — é puramente
  determinístico por construção.
- Ambos gravam `validation_status='not_validated'` na criação — nunca presumimos validação por
  ausência de dado.

## Compatibilidade

`complete-sera-analysis.ts` mantém (e estende) o padrão já existente de retry-sem-coluna: se o
upsert falhar por uma coluna de proveniência ainda não migrada no ambiente, as colunas de
proveniência são removidas do payload e o upsert é tentado novamente — o mesmo padrão já usado
para `analysis_completeness`/`motor_version` antes desta etapa.

## Interface administrativa

O componente `EngineProvenanceBadge` (ver `04-congelamento-legado.md`/F-14) permite inspecionar
motor/versão/origem/status diretamente na tela de evento e no relatório impresso — primeiro
passo para "interface administrativa deve permitir inspecionar a proveniência" (§4.1). Uma tela
dedicada de auditoria (listar todas as análises com proveniência, filtrar por
`generated_by_type`/`validation_status`) não foi construída nesta etapa — ver riscos residuais.
