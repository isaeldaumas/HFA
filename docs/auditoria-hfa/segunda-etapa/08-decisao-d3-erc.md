# Ficha de Decisão D3 — ERC Canônico

**Não se propõe uma fórmula canônica** — não há fonte suficiente (Hendy apresenta o ERC como
conceito a validar, R-08). Esta ficha organiza a decisão.

## Definições encontradas (ver [05-auditoria-erc.md](05-auditoria-erc.md))
- **Família A** (`erc_level`, escala motor 1=crítico): LLM (#1) + `inferDeterministicErcLevel`
  (#2) + `inferErcLevel` (#3). Usada pelo **trend**.
- **Família B** (`computeHfaErcCategoryFromCodes`, matriz ARMS, escala HFA 5=crítico): recomputa
  dos códigos. Usada pelo **card**.
- Conversões/apresentação: `coerceMotorErcToHfaCategory` (#5), `hfaErcToArmsBarrier` (#6).

## Diferenças e limitações
- A e B usam **entradas diferentes** (texto+códigos+LLM vs só códigos) e **escalas invertidas** →
  divergência reproduzida (EXP-ERC-01), incluindo o caso "sem falha" com trend=4 e card=1.
- Nenhuma tem validação científica; a matriz ARMS de B é arbitrária/hardcoded.
- Ambas rodam sobre amostra pequena (R-10) e misturam proveniência legado+vNext.

## Usos aceitáveis vs não sustentados
| Uso | Sustentável? |
|---|---|
| Contagem/frequência de códigos por período, com caveat | Sim |
| Distribuição observada (com `data-confidence`) | Sim (com limitações) |
| "Nível de risco" operacional por evento | **Não** (sem fonte, F-05) |
| Priorização operacional baseada no card **ou** no trend | **Não** (contradizem-se, F-04) |
| Probabilidade de acidente | **Não** (proibido; já vetado no prompt de ai-insight) |

## Alternativas
- **D3-a (recomendada tecnicamente):** **uma única** derivação por análise, declarada
  explicitamente como *estimativa assistiva não validada*, com escala única e caveat obrigatório;
  card e trend passam a ler a **mesma** fonte. Elimina F-04.
- **D3-b:** **remover** o "nível de risco" até validação; exibir apenas contagem/frequência de
  códigos e pré-condições com `data-confidence`. Mais conservadora; alinhada a R-08/Hendy.
- **D3-c:** manter ambos, mas **rotular como não reconciliados** e proibir uso decisório
  (contenção mínima de RC-1).

## Decisão pendente [AUTORAL/metodológico]
- Escolher D3-a / D3-b / D3-c.
- Se D3-a: qual das derivações vira a única (recomendação: a que parte **dos códigos + evidência**,
  nunca de palavra-chave), e qual escala/direção.
- Declarar a fonte/limitação da fórmula ou assumir "estimativa não validada".
- Definir se ERC pode ser computado quando o eixo é `UNRESOLVED`/insuficiente (liga a D2/RC-2).
