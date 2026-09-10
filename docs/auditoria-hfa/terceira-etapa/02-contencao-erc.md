# Contenção do ERC (F-04)

## Diagnóstico usado como base (revalidado nesta etapa)

Ao investigar a fundo para implementar a contenção, foi encontrado um quadro mais preciso do que
o descrito na segunda etapa:

- O **card/distribuição** e a **tendência** de `/api/risk-profile` na verdade usam a **mesma**
  função (`computeHfaErcCategoryFromCodes`, mecanismo `ARMS_CODE_MATRIX_V1`) — a função
  `buildRiskQualityTrend` (mecanismo `MOTOR_HEURISTIC_V1`, baseada em `erc_level`) é **código
  morto**, nunca chamada em nenhuma tela ou rota real (confirmado por busca exaustiva).
  `calculateModalHfaErcCategory` (erc-modal.ts) também é código morto.
- A contradição **real e viva** está em `reports/event/[id]/page.tsx`: a mesma tela exibia, lado
  a lado, **"ERC legado (motor): {analysis.erc_level}"** (escala 1=crítico) e **"Categoria visual
  HFA ERC: {hfaLabel(computeHfaErcCategoryFromCodes(...))}"** (escala 5=crítico), sem qualquer
  aviso de que são mecanismos incompatíveis com escalas invertidas.
- Adicionalmente, `events/[id]/page.tsx` continha uma **segunda cópia hardcoded independente**
  da matriz ARMS (`EV_ARMS_SEV_ROW`/`EV_ARMS_ERC`/`evBarrierLevel`), com os mesmos valores de
  `risk-profile/erc.ts` — duplicação de código, risco de divergência futura mesmo que os valores
  coincidam hoje.

## O que foi implementado

1. **`frontend/src/lib/risk-profile/erc-containment.ts`** (novo) — registro fechado dos
   mecanismos ERC vivos (`MOTOR_HEURISTIC_V1`, `ARMS_CODE_MATRIX_V1`), cada um com versão,
   direção de escala e status (`HEURISTIC_NOT_VALIDATED`). Função `describeErcValue(mechanismId,
   input)` sempre retorna um rótulo que cita o mecanismo — nunca um número "nu". Guarda de
   desenvolvimento `assertNoSilentErcConsolidation` lança erro se alguém tentar tratar valores de
   mecanismos diferentes como um indicador único sem a flag de decisão D3 ligada.
2. **`reports/event/[id]/page.tsx`** corrigido: os dois valores agora usam `describeErcValue` e
   exibem explicitamente qual mecanismo/versão os gerou, mais o aviso padrão de contenção
   (`buildErcContainmentNotice()`).
3. **`events/[id]/page.tsx`** corrigido: a matriz ARMS duplicada foi removida; a tela agora
   importa `getArmsSeverityRow`/`getArmsBarrierLevel`/`computeHfaErcCategoryFromCodes` de
   `@/lib/risk-profile/erc.ts` (fonte única) e exibe o mecanismo/versão no rodapé do card.
4. **Funções mortas marcadas como DEPRECATED** (`risk-quality-trend.ts`, `erc-modal.ts`) com
   aviso explícito de que reintroduzi-las sem passar pela contenção reproduz o F-04.
5. **Solução preferencial da tarefa** ("desabilitar visualizações consolidadas", "mensagem de
   indisponibilidade temporária") foi implementada como **capacidade configurável**
   (`isErcConsolidatedViewEnabled()`, desligada por padrão) em vez de forçada globalmente, porque
   nesta investigação não havia, de fato, uma view "consolidada" ativa em produção — havia sim a
   contradição pontual do relatório de evento, que foi corrigida por rotulagem explícita (mais
   apropriado que ocultar um dado real por trás de uma mensagem de indisponibilidade).

## O que NÃO foi feito (fora do escopo autorizado)
- Nenhuma fórmula foi escolhida como canônica.
- Nenhum dado histórico (`erc_level` armazenado, `engine_output`) foi apagado ou recalculado.
- Os mecanismos mortos não foram deletados do repositório (apenas marcados) — decisão de manter
  para rastreabilidade histórica até D3.

## Testes (ver 09-testes-e-resultados.md)
- `tests/hfa-audit/erc-containment/erc-containment-trial-001.ts` — comportamento de
  `describeErcValue`/`buildErcContainmentNotice`/flag de contenção.
- `tests/hfa-audit/erc-containment/erc-containment-trial-002-static.ts` — contrato estático:
  funções mortas não são usadas fora de seu próprio arquivo; as duas telas usam a contenção; a
  matriz duplicada foi removida de `events/[id]`.
