# Decisões Formais Consideradas Aprovadas Nesta Etapa

Conforme o pedido do usuário, as seguintes decisões foram tratadas como aprovadas para efeito
desta etapa de implementação. Não são decisões metodológicas definitivas sobre o CONTEÚDO da
metodologia (que continuam pendentes — ver segunda etapa), mas autorizações de ARQUITETURA/
PROCESSO para permitir avançar sem ambiguidade paralisante.

## D1 — Motor-alvo
- vNext é o núcleo metodológico canônico **futuro**.
- Legado é congelado metodologicamente, mas continua **operacional** (nenhuma flag de produção
  foi alterada; `SERA_VNEXT_CANONICAL_ANALYZE_ENABLED` permanece com o comportamento padrão de
  antes desta etapa).
- vNext entra **apenas** como infraestrutura de shadow mode (preparada, desligada).
- Resultado do vNext nunca substitui legado ou decisão humana.
- Promoção depende de gates formais futuros (fora do escopo desta etapa).

## D2 — Incerteza
- Vocabulário estrutural definido (`NOT_ASSESSED`, `INSUFFICIENT_EVIDENCE`,
  `CONTRADICTORY_EVIDENCE`, `UNRESOLVED`, `NOT_APPLICABLE`, `ABSENT_CONFIRMED`,
  `PRESENT_PROBABLE`, `PRESENT_CONFIRMED`, `OUTSIDE_TAXONOMY`) documentado em
  `07-decisao-d2-incerteza.md` (segunda etapa) e referenciado nas colunas `validation_status`/
  `generated_by_type` desta etapa como primeiro passo estrutural.
- **Não** alteramos classificações históricas para esses estados — isso requer decisão de
  produto sobre reprocessamento, fora do escopo autorizado aqui.
- `P-A`/`O-A`/`A-A` **não** foram tratados como equivalentes automáticos de ausência de
  informação em nenhum novo código desta etapa (a contenção de F-03 propriamente dita — mudar o
  comportamento do motor legado — continua pendente de decisão D2 completa; não implementada
  nesta etapa, que é escopo de contenção/infraestrutura, não de correção do motor).

## D3 — ERC
- Nenhum dos 6 mecanismos foi declarado canônico.
- Valores históricos (`analyses.erc_level`, `engine_output` do vNext) preservados sem alteração.
- Mecanismos diferentes não são misturados: cada exibição agora identifica de qual mecanismo o
  valor vem (`ERC_MECHANISMS` em `erc-containment.ts`).
- Nenhum ERC "consolidado" contraditório é apresentado sem identificação de mecanismo
  (`isErcConsolidatedViewEnabled()` desligado por padrão).
- ERC continua explicitamente rotulado como estimativa heurística não validada, nunca como base
  de decisão operacional.

## D4 — Taxonomia
- Estrutura de tabela versionada criada (`sera_taxonomy_entries`), **vazia**.
- Divergências entre Hendy, Daumas, legado e vNext permanecem documentadas (segunda etapa,
  `09-decisao-d4-taxonomia.md`) — não resolvidas aqui.
- Nenhum código, rótulo, eixo ou tradução foi alterado nesta etapa sem decisão específica (as
  únicas mudanças em arquivos de rótulo foram comentários de congelamento, não valores).
