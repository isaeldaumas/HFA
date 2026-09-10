# Auditoria de ERC e Indicadores

## Catálogo de implementações

| # | Nome exibido / papel | Conceito pretendido | Fórmula | Escala / direção | Fonte | Código | Ausentes | Em produção |
|---|---|---|---|---|---|---|---|---|
| 1 | `erc_level` (LLM) | dificuldade de detectar/reverter o erro | prompt "tabela ERC" | 1–5, 1=crítico | rótulo "Hendy 2003" (não fórmula) | `all-steps.ts:3865,3903` | — | Sim (base) |
| 2 | `inferDeterministicErcLevel` | idem, determinístico | regras texto+códigos, override do LLM | 1–5, 1=crítico | heurística interna | `all-steps.ts` | retorna `current` | Sim (override) |
| 3 | `inferErcLevel` | idem, fallback | regras texto+códigos | 1–5, 1=crítico | heurística interna | `pipeline.ts:285` | default 2 | Sim (fallback) |
| 4 | `computeHfaErcCategoryFromCodes` (card) | categoria de risco visual | matriz ARMS severidade×barreira | 1–5, 5=crítico | ARMS hardcoded, sem fonte | `risk-profile/erc.ts:34` | `null` se sem P | Sim (card) |
| 5 | `coerceMotorErcToHfaCategory` (trend) | conversão p/ exibição | bijeção motor↔HFA | 1–5, 5=crítico | conversão | `erc-conversion.ts:69` | `null` | Sim (trend) |
| 6 | `hfaErcToArmsBarrier` | coluna de barreira ARMS | mapa HFA→1–4 | 1–4 | apresentação | `erc-presentation.ts:19` | — | Sim (apresentação) |

## Respostas objetivas exigidas

1. **Quantas definições diferentes de ERC existem?** Seis mecanismos (#1–#6). Como
   *produtoras* de valor de risco: **quatro** (#1,#2,#3 convergem numa escala; #4 é independente).
   Em **duas famílias**: (A) `analyses.erc_level` [#1/#2/#3] usada pelo **trend**; (B) recomputada
   dos códigos [#4] usada pelo **card**.
2. **Quais produzem resultados incompatíveis?** Famílias A e B — **reproduzido** (EXP-ERC-01):
   P-C/O-A/A-A → trend 3 vs card 2; P-A/O-A/A-A → trend 4 vs card 1.
3. **Quais têm fonte metodológica explícita?** **Nenhuma** com fórmula validada. #1 invoca "Hendy
   2003" como rótulo, mas Hendy apresenta o ERC como conceito a validar (R-08), não como fórmula.
4. **Quais são heurísticas?** #2, #3 (keyword+código), #4 (matriz ARMS arbitrária), #1 (LLM).
5. **Quais em produção?** Todas as seis.
6. **Misturam dados de versões diferentes?** Sim — o `risk-profile/server.ts` agrega **legado
   (`analyses`)** e **vNext (`sera_vnext_analyses`)** no mesmo perfil; o card recomputa dos códigos,
   misturando proveniências de motores distintos sem normalização de escala/semântica.
7. **Risco de decisão operacional com resultado inconsistente?** **Sim** — RC-1: card e trend
   contradizem-se para o mesmo evento; um gestor priorizando pelo card vê "aceitável" onde o trend
   vê "urgente".

## Direção da escala (fonte de F-08)
- Motor (`erc_level`): **1 = crítico … 5 = mínimo**.
- HFA categoria (card/trend/UI): **5 = crítico … 1 = aceitável**.
- `MOTOR_TO_HFA` é auto-inversa; qualquer nova tela que leia `erc_level` cru como se fosse HFA
  inverte a severidade.

## Conclusão
Não há uma fórmula ERC canônica sustentável hoje; há um **emaranhado de heurísticas** em duas
escalas invertidas, com uma recomputação independente na tela de risco. **Não se propõe fórmula
canônica** (sem fonte suficiente — R-08/Hendy). A decisão D3 deve escolher entre (a) unificar numa
única derivação declarada como estimativa, (b) remover o índice até validação, ou (c) manter
apenas contagem/frequência com caveats, sem "nível de risco".
