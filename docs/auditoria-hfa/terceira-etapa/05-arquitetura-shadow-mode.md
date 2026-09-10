# Arquitetura de Shadow Mode (preparada, desligada por padrão)

## Módulo `frontend/src/lib/sera-shadow/`

| Arquivo | Papel |
|---|---|
| `feature-flags.ts` | 5 flags independentes, todas lendo `env === 'true'` (default `false`) |
| `types.ts` | `ShadowRunContext`, `ShadowAxisDivergence`, `ShadowRunSummary`, `ShadowRunOutcome` |
| `repository.ts` | `findExistingShadowResult` / `insertShadowResult` / `listShadowResultsForTenant` — todas tenant-scoped |
| `run-shadow-analysis.ts` | Orquestrador `runShadowVNextIfEnabled` |

## Flags (todas `false` por padrão)

| Flag | Papel |
|---|---|
| `SERA_SHADOW_EXECUTION_ENABLED` | roda o motor vNext em paralelo ao legado |
| `SERA_SHADOW_PERSISTENCE_ENABLED` | grava o resultado candidato em `sera_vnext_shadow_results` |
| `SERA_SHADOW_ADMIN_VIEW_ENABLED` | permite tela administrativa consultar comparações |
| `SERA_SHADOW_AUTO_COMPARISON_ENABLED` | habilita job de comparação automática |
| `SERA_SHADOW_VALIDATION_REPORTS_ENABLED` | inclui divergências de shadow em relatórios de validação |

## Fluxo

1. `completeSeraAnalysisAfterEventCreated` (legado), **após** persistir a análise de produção,
   chama `runShadowVNextIfEnabled` dentro de um `try/catch` que **nunca** relança — qualquer
   falha do vNext é logada e engolida (`console.error('[shadow-mode] falha isolada...')`).
2. Se `SERA_SHADOW_EXECUTION_ENABLED` estiver desligada (padrão), a função retorna
   `{ status: 'SKIPPED_DISABLED' }` **sem tocar no cliente Supabase** — verificado pelo teste
   `shadow-mode-trial-001.ts` com um proxy que lança exceção se qualquer propriedade for
   acessada.
3. Se ligada, roda `analyzeSeraVNext` (motor determinístico, `allowLlm: false`) com a mesma
   narrativa do evento, calcula `shadow_run_id` determinístico
   (`sha256(tenantId:legacyAnalysisId:engineVersion)`), verifica idempotência (se
   `SERA_SHADOW_PERSISTENCE_ENABLED`, consulta antes de inserir) e computa divergência por eixo
   comparando o código do legado com o status/código do vNext.
4. Se `SERA_SHADOW_PERSISTENCE_ENABLED`, grava em `sera_vnext_shadow_results` (tabela
   append-only, RLS habilitada, `tenant_id` obrigatório) — nunca em `analyses` ou
   `sera_vnext_analyses`.

## Restrições atendidas (§7.1 da tarefa)

| Restrição | Como é garantida |
|---|---|
| Candidato não substitui produção | Tabela separada; nenhum código escreve `sera_vnext_shadow_results` em `analyses` |
| Candidato não aparece ao usuário comum | Nenhuma rota pública lê a tabela; flag de admin view separada e desligada |
| Só perfis autorizados consultam comparações | `SERA_SHADOW_ADMIN_VIEW_ENABLED` — nenhuma tela construída ainda a consome (infra apenas) |
| Nenhuma ação corretiva disparada pelo candidato | Nenhum código de `corrective_actions` referencia `sera-shadow` |
| Nenhum indicador agregado mistura legado e vNext | `risk-profile/server.ts` não foi alterado para ler `sera_vnext_shadow_results` |
| Reprocessamento idempotente | `shadow_run_id` determinístico + check-then-insert em `findExistingShadowResult` |
| Falha do vNext não impede fluxo legado | `try/catch` que nunca relança, chamado **após** a análise legada já estar persistida |
| Isolamento entre tenants | Toda leitura filtra `tenant_id`; RLS habilitada (mesma ressalva de F-01 documentada) |

## O que NÃO foi feito
- Nenhuma tela administrativa de comparação foi construída (só a infraestrutura de dados).
- O job de comparação automática (`SERA_SHADOW_AUTO_COMPARISON_ENABLED`) não tem implementação
  além da flag — é um placeholder para a fase de ativação.
- Nenhuma migration adiciona uma constraint `UNIQUE(tenant_id, shadow_run_id)` — a idempotência é
  garantida apenas em nível de aplicação (ver `08-migrations.md` §riscos).
