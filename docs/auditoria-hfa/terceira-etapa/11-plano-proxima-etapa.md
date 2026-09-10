# Plano para a Próxima Etapa

## Pré-requisitos para ativar shadow mode de fato
1. Confirmar qual motor vNext é o oficial de shadow (`analyzeSeraVNext` vs `sera-vnext-product`
   + `engine-v0`) — decisão técnica pendente (ver riscos residuais).
2. Endurecer idempotência de `shadow_run_id` com constraint `UNIQUE(tenant_id, shadow_run_id)`
   (nova migration).
3. Construir tela administrativa de comparação (consumindo
   `isShadowAdminViewEnabled`/`listShadowResultsForTenant`), restrita por `requireAdmin`.
4. Ligar `SERA_SHADOW_EXECUTION_ENABLED` primeiro em ambiente interno, sem persistência, para
   medir latência/estabilidade antes de `SERA_SHADOW_PERSISTENCE_ENABLED`.

## Decisões metodológicas ainda necessárias (D2/D3/D4)
- Ver `docs/auditoria-hfa/segunda-etapa/07..09-decisao-*.md` — não avançam sozinhas; exigem
  decisão autoral registrada no Methodology Control Board.

## Consolidação do congelamento fragmentado
- Avaliar se os ~8 testes de "diff zero" de fases anteriores devem ser aposentados/consolidados
  em favor do teste-tripwire desta etapa (`legacy-freeze-trial-001.ts`), ou se ambos devem
  coexistir permanentemente. Decisão de processo, não técnica.

## Cobertura de proveniência
- Instrumentar os caminhos de **atualização** (recalculate, reanalyze, edição manual) para
  manter `validation_status`/`generated_by_type` corretos após reclassificação.
- Construir tela de auditoria agregada de proveniência (filtrar por motor/origem/status).

## Isolamento entre tenants
- Quando houver Supabase de staging autorizado: rodar os 12 cenários também como testes
  `REAL_DB` reais (inserir tenant A/B de verdade, tentar cruzar), complementando o contrato
  estático desta etapa.
- Decidir e implementar a correção de RLS (hook `custom_access_token` ou reescrita de
  `get_tenant_id()`) como migration própria, com revisão separada.

## Taxonomia
- Após D4, popular `sera_taxonomy_entries` a partir da decisão formal e migrar os
  consumidores atuais (`failure-names.ts`, `hfacs-mapper.ts`, `canonical-codes.ts`) para lerem
  dessa tabela como fonte única.
