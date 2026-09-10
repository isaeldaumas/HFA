# D3 — ERC: Decisão Humana/Autoral Requerida

**Status**: `D3_ERC_HUMAN_DECISION_REQUIRED`
**Criado em**: 2026-09-10
**Referência**: `docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md`

---

## Contexto

A terceira etapa da auditoria HFA fez **contenção** — não canonização.

Os dois mecanismos ERC existentes são incompatíveis e coexistem com escalas invertidas:

| Mecanismo | ID | Escala | Fonte | Arquivo |
|-----------|-----|--------|-------|---------|
| Motor heurístico | `MOTOR_HEURISTIC_V1` | 1=crítico…5=mínimo | LLM + heurística palavra-chave | `analyses.erc_level` |
| Matriz ARMS por código | `ARMS_CODE_MATRIX_V1` | 5=crítico…1=aceitável | Códigos P/O/A via matriz hardcoded | `risk-profile/erc.ts` |

A divergência é reproduzível: um evento "sem falha" pode ter `MOTOR=4` e `ARMS=1`.

## O que foi feito (terceira etapa)

- Contenção ativa em `erc-containment.ts`: todo valor ERC exibido deve se identificar
- Congelamento da matriz ARMS: `ARMS_CODE_MATRIX_V1` não pode ser alterada sem decisão D3
- `MOTOR_HEURISTIC_V1` (`erc-modal.ts`) marcado como DEPRECATED
- Nenhum mecanismo foi declarado canônico

## Implementações ERC existentes

```
frontend/src/lib/risk-profile/erc.ts          — ARMS_CODE_MATRIX_V1 (ativa, congelada)
frontend/src/lib/risk-profile/erc-containment.ts — camada de contenção (active)
frontend/src/lib/sera/erc-modal.ts            — MOTOR_HEURISTIC_V1 modal (DEPRECATED)
frontend/src/lib/sera/erc-presentation.ts     — apresentação
frontend/src/lib/sera/erc-conversion.ts       — conversões entre mecanismos
frontend/src/lib/sera/risk-quality-trend.ts   — DEPRECATED (mecanismo morto)
```

## Telas consumidoras

| Tela | Mecanismo atual | Notas |
|------|----------------|-------|
| Perfil de risco (`/risk-profile`) | `ARMS_CODE_MATRIX_V1` via `describeErcValue` | Contenção ativa |
| Evento (`/events/[id]`) | `ARMS_CODE_MATRIX_V1` via import único | Corrigido na 3ª etapa |
| Trend histórico | `MOTOR_HEURISTIC_V1` (analyses.erc_level) | DEPRECATED, não exibido em produção |

## Opções de decisão

### D3-a (recomendada tecnicamente)
Uma única derivação por análise, declarada explicitamente como estimativa assistiva não validada.
Card e trend passam a ler a mesma fonte. Elimina F-04 (divergência reproduzível).

**Implicação**: escolher qual mecanismo sobrevive e qual escala. Recomendação técnica: partir
dos códigos P/O/A (nunca de palavra-chave), documentar como "estimativa não validada".

### D3-b
Remover "nível de risco" até validação científica. Exibir apenas contagem/frequência de
códigos e pré-condições com `data-confidence`. Mais conservador; alinhado a Hendy R-08.

### D3-c
Manter ambos, rotular como não reconciliados, proibir uso decisório. Contenção mínima (já
implementada na 3ª etapa como estado transitório).

## Impacto de cada opção

| Dimensão | D3-a | D3-b | D3-c |
|----------|------|------|------|
| Complexidade de implementação | Média | Baixa | Mínima |
| Risco metodológico | Baixo se bem declarado | Muito baixo | Médio (dois indicadores confusos) |
| Impacto em UI | Médio (redesign do card/trend) | Alto (remoção de seção) | Mínimo |
| Alinhamento com Hendy R-08 | Parcial | Total | Baixo |

## Decisão requerida

1. Escolher D3-a, D3-b ou D3-c
2. Se D3-a: qual mecanismo sobrevive (código→ARMS ou narrativa→motor)?
3. Qual escala/direção declarada?
4. Pode ERC ser computado quando eixo é `UNRESOLVED` ou insuficiente?
5. Declarar como "estimativa não validada" ou remover até validação?

**Autor/responsável**: decisão metodológica/autoral — não pode ser feita automaticamente.

## Restrição ativa

`NO_CANONICAL_ERC_WITHOUT_D3_DECISION`

Não alterar escalas, matrizes ou displays em produção antes desta decisão.
