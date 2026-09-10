# Plano de Transição (condicional à aprovação de D1 = promover vNext)

Nada aqui é executado nesta etapa. Nenhum resultado candidato do vNext deve substituir
silenciosamente uma classificação de produção.

## 1. Congelamento do legado
- Legado permanece como está, marcado `FROZEN_PRODUCTION_ESTIMATE`. Sem novas features; correções
  só de contenção (RC-1/RC-2/RC-3) se autorizadas.

## 2. vNext em shadow mode
- Para cada análise nova, rodar **também** o vNext (sem exibir ao usuário final), gravando em
  armazenamento **separado** (`sera_vnext_analyses` já existe e é tenant-scoped).
- Flag de shadow distinta da flag de exibição; ambas off por default.

## 3. Armazenamento separado de candidatos
- Resultados vNext ficam como `candidate-only` (proposedCode, sem releasedCode) — respeitando
  L-06/L-07. Nunca sobrescrevem `analyses`.

## 4. Comparação automática entre motores
- Job de comparação: para cada evento, registrar (código legado) × (estado vNext:
  UNRESOLVED/pending-human) e a divergência de ERC. Métrica de "taxa de casos que o legado fechou
  e o vNext deixaria para humano".

## 5. Análise humana das divergências
- Revisores (≥3 — hoje bloqueado em 1, ver memória `project-sera-vnext-status`) adjudicam uma
  amostra; medir concordância humano×humano e humano×legado.

## 6. Critérios de aceitação (quant. e qual.)
| Critério | Meta |
|---|---|
| Casos sem evidência que o vNext marca UNRESOLVED (e o legado fechava) | 100% viram revisão humana |
| Concordância inter-revisor (κ) | ≥ 0,6 |
| Divergência ERC card×trend | 0 (após D3) |
| Casos "léxico enganoso" (#22) resolvidos por evidência, não palavra | 100% |
| Reconciliação tela×API×banco×relatório | divergência 0 |

## 7. Casos históricos
- **[AUTORAL]** decidir: (a) manter histórico do legado como `LEGACY_ESTIMATE` imutável; (b)
  reprocessar seletivamente sob vNext+humano; (c) marcar `NAO_AVALIADO` os eixos sem evidência.
- Não reclassificar automaticamente sem revisão humana.

## 8–10. Versionamento
- **Taxonomia:** `SERA_PT_CANONICAL_v1.0` (já referenciada no vNext) como única fonte.
- **Motor:** `engineVersion` gravado por análise (vNext já faz).
- **Indicadores:** versão do ERC (após D3) gravada com cada valor; nunca comparar versões
  diferentes sem normalização.

## 11. Rollback
- Como shadow não altera produção, rollback = desligar flags de shadow/exibição. Sem migração
  destrutiva antes da promoção efetiva.

## 12. Promoção gradual
- Por tenant/coorte, atrás de flag; primeiro internal pilot, depois enterprise selecionados.
- Exibição vNext ao usuário só após aceitação dos critérios da §6.

## 13. Desativação do legado
- Só após promoção estável + histórico tratado (§7). Congelar antes de remover.

## 14. Monitoramento pós-migração
- Painel de divergência motor×humano; alertas de reconciliação ERC; auditoria de que nenhum
  candidato vNext virou decisão sem validação humana (invariante L-06).

## Dependências de decisão
- D1 (motor-alvo), D2 (incerteza), D3 (ERC), D4 (taxonomia) devem estar decididas antes da
  promoção efetiva. Shadow mode pode começar após D1, mas exibição exige D2/D3/D4.
