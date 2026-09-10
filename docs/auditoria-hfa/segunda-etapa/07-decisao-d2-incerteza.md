# Ficha de Decisão D2 — Contrato de Incerteza

## Problema
O legado colapsa múltiplos estados epistêmicos em "sem falha" (`P-A/O-A/A-A`) ou num código
terminal (F-03). Não há vocabulário para distinguir ausência, não-avaliação, contradição, etc.
O vNext já distingue alguns estados (`INSUFFICIENT_EVIDENCE`, `REVIEW_REQUIRED`, `UNRESOLVED`).

## Estados a padronizar (proposta de vocabulário canônico)

| Estado | Significado | Distinto de |
|---|---|---|
| `PRESENTE` | fator confirmado por evidência | — |
| `PRESENCA_PROVAVEL` | evidência parcial sugere presença | PRESENTE |
| `AUSENCIA_COMPROVADA` | evidência mostra que o fator não ocorreu | NAO_AVALIADO |
| `NAO_IDENTIFICADO` | procurou-se, não se achou evidência | AUSENCIA_COMPROVADA |
| `NAO_AVALIADO` | eixo/fator não foi analisado | NAO_IDENTIFICADO |
| `EVIDENCIA_INSUFICIENTE` | há indício, insuficiente para classificar | NAO_AVALIADO |
| `INFORMACAO_CONTRADITORIA` | fontes conflitam | EVIDENCIA_INSUFICIENTE |
| `NAO_APLICAVEL` | fator não se aplica ao caso | AUSENCIA_COMPROVADA |
| `UNRESOLVED` (eixo) | axis sem código canônico fechado | `P-A`/`O-A`/`A-A` |

**Regra invariante (do lock L-02):** `NAO_AVALIADO`/`EVIDENCIA_INSUFICIENTE`/`UNRESOLVED` **nunca**
podem ser contados como `AUSENCIA_COMPROVADA` nem exibidos como "sem falha".

## Impacto por camada

| Camada | Mudança necessária | Observação |
|---|---|---|
| Motor | Emitir estado epistêmico por eixo/fator; nunca default silencioso p/ "sem falha" | vNext já faz; legado não |
| Banco | Coluna de status por eixo (enum) além do código; migração aditiva | [AUTORAL] esquema |
| Interface | Exibir estado (ex.: "não avaliado") distinto de "sem falha"; cor/rótulo próprios | evita leitura enganosa |
| Filtros | Excluir `NAO_AVALIADO`/`UNRESOLVED` de contagens de "sem falha"; opção de filtrar por estado | reconciliação |
| Indicadores | ERC/risco não deve computar em cima de `UNRESOLVED`/insuficiente (liga-se a RC-2) | ver D3 |
| Relatórios | Seção explícita de incertezas e lacunas | Hendy: pré-condições/lacunas |

## Alternativas
- **D2-a (recomendada):** adotar o vocabulário acima como enum canônico versionado; motor de
  produção obrigado a emiti-lo; UI e indicadores obrigados a respeitá-lo.
- **D2-b:** adotar apenas `UNRESOLVED` binário (classificado / não classificado). Mais simples,
  perde granularidade (não distingue contradição de ausência).
- **D2-c:** manter legado, apenas proibir o fallback "sem falha" e marcar como `UNRESOLVED`.
  Mínimo para eliminar F-03, sem o vocabulário completo.

## Decisão pendente [AUTORAL/metodológico]
- Escolher D2-a / D2-b / D2-c.
- Definir o enum e sua versão (taxonomia de incerteza).
- Definir tratamento retroativo do histórico do legado (marcado como `NAO_AVALIADO`?).
