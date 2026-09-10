# Riscos Residuais — Terceira Etapa

## Sobre o F-01 (isolamento entre tenants)
- A RLS continua estruturalmente inoperante (`get_tenant_id()` lê claim nunca populado) — **não
  foi corrigida nesta etapa** por instrução explícita ("não altere ainda a estratégia de RLS sem
  uma migration específica e revisão separada"). O enforcement continua sendo 100%
  application-layer, agora coberto por um contrato estático automatizado (12/12 cenários), mas
  sem defesa em profundidade real.
- A nova tabela `sera_vnext_shadow_results` **herda a mesma ressalva**: tem RLS habilitada com
  policies que dependem de `get_tenant_id()` (mesma função inoperante). Documentado no comentário
  da tabela, propositalmente, para não repetir a falsa sensação de segurança.

## Sobre a contenção ERC (F-04)
- A contenção resolve o problema de **apresentação** (rótulos, identificação de mecanismo). Não
  resolve o problema de **fundamentação metodológica** da matriz ARMS hardcoded (F-05) — isso
  continua exigindo decisão D3 com fonte declarada.
- As duas funções "mortas" (`buildRiskQualityTrend`, `calculateModalHfaErcCategory`) não foram
  removidas do repositório, apenas marcadas. Um desenvolvedor apressado ainda pode religá-las
  manualmente ignorando o aviso — o teste estático detecta isso, mas só se rodado em CI.

## Sobre proveniência
- Cobertura de escrita: apenas os dois caminhos de criação principais (`completeSeraAnalysisAfterEventCreated`
  e `createSeraVNextAnalysis`) gravam proveniência. Caminhos de **atualização** (recalculate,
  reanalyze, edits) não foram auditados/instrumentados nesta etapa — podem deixar
  `validation_status`/`generated_by_type` desatualizados após uma reclassificação.
- Não existe tela administrativa dedicada para inspecionar proveniência em lote (só badge
  pontual por análise).
- A distinção `llm_suggestion` vs `deterministic_engine` no legado é uma **aproximação por
  análise inteira**, não por eixo — o motor legado não suporta granularidade maior (F-13
  reafirmado).

## Sobre shadow mode
- Nenhuma tela de comparação foi construída — a infraestrutura de dados existe, mas não há
  consumidor administrativo ainda.
- Idempotência de `shadow_run_id` é só em nível de aplicação (sem constraint `UNIQUE` no banco)
  — risco de linha duplicada em condição de corrida (dois requests concorrentes para a mesma
  análise) se e quando as flags forem ligadas. Aceitável enquanto desligado.
- O motor vNext usado no shadow (`analyzeSeraVNext`, engine.ts) é diferente do motor vNext usado
  no fluxo de produto beta (`sera-vnext-product` + `engine-v0`). Não foi feita uma análise de
  qual dos dois deveria ser o motor de shadow "oficial" — escolhemos `analyzeSeraVNext` por ser
  o mais simples/determinístico de rodar isoladamente. Isso é uma decisão técnica implícita que
  merece confirmação formal antes da ativação real.

## Sobre o congelamento do legado
- Descobrimos (e documentamos) que há ~8 testes de fases anteriores fazendo checagens de "diff
  zero" em `frontend/src/lib/sera/`, de forma fragmentada e amarrada a nomes de fase antigos.
  Não foram consolidados nem removidos (fora do escopo autorizado). Continuam existindo como
  camadas paralelas de proteção, o que pode confundir desenvolvedores futuros sobre qual é o
  mecanismo "oficial" de congelamento.

## Sobre a migration
- Validada apenas contra Postgres local descartável — **não aplicada a nenhum ambiente real**.
  A validação sintática/funcional é forte, mas não substitui um `supabase db push` real contra
  staging antes de produção.

## Decisões metodológicas ainda pendentes (herdadas da segunda etapa, não resolvidas aqui)
- D2 completa (adoção do vocabulário de incerteza no motor legado propriamente dito).
- D3 (qual mecanismo ERC — ou nenhum — é canônico).
- D4 (resolução das divergências de rótulo/eixo entre Hendy, Daumas, legado, vNext).
- Promoção efetiva do vNext (D1 além da preparação de shadow mode).
