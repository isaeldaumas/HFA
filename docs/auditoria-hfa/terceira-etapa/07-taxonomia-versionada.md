# Taxonomia Versionada — Apenas Infraestrutura

## Tabela `public.sera_taxonomy_entries` (nova, vazia)

Campos exatamente conforme pedido: `canonical_code`, `canonical_name`, `translated_name`,
`description`, `axis` (`P`/`O`/`A`), `parent_code`, `source_reference`, `methodology_version`,
`taxonomy_version`, `valid_from`, `valid_until`, `status`
(`DRAFT_NOT_MIGRATED`/`ACTIVE`/`SUPERSEDED`/`RETIRED`), `divergence_notes`.

Constraint `UNIQUE(canonical_code, taxonomy_version)` — permite múltiplas versões do mesmo
código coexistirem (necessário para D4, já que a alocação código↔eixo↔rótulo diverge entre
Hendy/Daumas/legado/vNext e pode mudar entre versões da taxonomia).

## Por que não migrar os códigos atuais agora

A tarefa é explícita: "não migre a taxonomia atual automaticamente sem revisão das divergências
de D4". A segunda etapa já registrou divergências reais não resolvidas (ex.: `P-D`/`P-G` com o
mesmo rótulo "Falha de Atenção"; `P-F` rotulado como "Falha de Percepção" no legado vs
"Informação Ilusória/Ambígua" em Daumas; alocação de eixo de "Knowledge (Decision) Failure"
entre Hendy e o código `A-E` do legado/Daumas — ver
`docs/auditoria-hfa/segunda-etapa/09-decisao-d4-taxonomia.md`). Popular a tabela agora, mesmo
com boas intenções, forçaria uma escolha implícita sobre essas divergências sem decisão autoral.

## Verificado nesta etapa

Teste funcional rodado contra a migration aplicada (ver `08-migrations.md`): a tabela
`sera_taxonomy_entries` permanece com `count(*) = 0` mesmo após inserir tenants, eventos,
análises e resultados de shadow — confirmando que nenhum código foi inserido incidentalmente
pela própria migration.

## Próximo passo (fora do escopo desta etapa)
Quando D4 for decidida, popular esta tabela a partir da decisão formal (não do código atual como
fonte de verdade), e então migrar `failure-names.ts`/`hfacs-mapper.ts`/`canonical-codes.ts` para
consumirem `sera_taxonomy_entries` como fonte única — eliminando a fragmentação código↔rótulo
hoje espalhada em 3+ arquivos.
