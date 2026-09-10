# Segunda Etapa — Resumo da Validação Contraditória

**Branch:** `auditoria-hfa-20260709` · **HEAD inicial (e final):** `315eac1a4728346dc893d6b09e7c9e91a4e000f6`
**Escopo:** validação contraditória, refutação e preparação de decisões. **Nenhum** arquivo de
código, migration, banco, fixture, prompt, teste, flag ou config de produção foi alterado. Os
experimentos rodaram em área isolada (`scratchpad`), fora da suíte oficial.

## Método
Para cada achado F-01..F-14 tentou-se **refutar** a conclusão inicial, buscando código/config/
migration/hook/teste que a contradiga, com reprodução independente. Cada item foi reclassificado
como fato comprovado / inferência / hipótese / risco potencial / falha reproduzida, e recebeu um
veredito (confirmado, parcial, reformulado, rebaixado, elevado, refutado, não reproduzível).

## Resultado por achado (14)

| ID | Veredito | Severidade (antes → depois) | Natureza da evidência |
|---|---|---|---|
| **F-01** | **Reformulado + rebaixado** (exposição **refutada**; mecanismo confirmado) | P1 → **P2** | Falha de exposição **refutada** por reprodução lógica |
| F-02 | **Confirmado** | P0 → P0 | Fato comprovado (código + flag default) |
| F-03 | **Confirmado + elevado em nuance** | P0 → P0 | Fato comprovado + **reproduzido** (contraste vNext) |
| F-04 | **Confirmado + elevado** | P1 → **P1 (reproduzido)** | **Falha efetivamente reproduzida** |
| F-05 | **Confirmado** | P1 → P1 | Fato comprovado (código sem fonte) |
| F-06 | **Confirmado** | P1 → P1 | Fato comprovado |
| F-07 | **Confirmado parcialmente** | P2 → P2 | Inferência (mapeamento HFACS pode ter justificativa própria) |
| F-08 | **Confirmado** | P2 → P2 | Fato comprovado |
| F-09 | **Confirmado** | P2 → P2 | Fato comprovado (corte fixo em 5) |
| F-10 | **Reformulado** (mitigação parcial existe) | P2 → **P3** | Fato comprovado + mitigação encontrada |
| F-11 | Confirmado | P3 → P3 | Fato comprovado |
| F-12 | Confirmado | P3 → P3 | Fato comprovado |
| F-13 | **Confirmado + reformulado** | P1 → **P2** | Inferência forte (não executado com LLM) |
| F-14 | Confirmado | P3 → P3 | Fato comprovado |

Detalhe em [01-reavaliacao-achados.md](01-reavaliacao-achados.md).

## Cinco conclusões que mudaram após a validação contraditória

1. **F-01 não é vazamento de dados.** Toda tabela tem RLS habilitada; as policies usam
   `get_tenant_id()` que retorna NULL e por isso **falham fechado** (negam), não abrem. O
   enforcement real é a camada de aplicação (service_role + filtro `tenant_id` derivado do JWT no
   servidor) e as RPCs `security definer` com checagem SQL de tenant. **Nenhuma superfície testada
   permite acesso cruzado.** O achado desce de P1 para P2 (defesa em profundidade inoperante,
   sem exposição).

2. **F-03 é ainda mais forte do que parecia.** Reproduzido: o motor **vNext**, sem LLM e sem
   decisão humana, retorna `UNRESOLVED`/`INSUFFICIENT_EVIDENCE` em **todos** os eixos e **exige
   revisão humana** — nunca fecha sozinho. O **legado** faz o oposto: sempre fecha em código
   terminal e, na ausência de evidência, usa `P-A/O-A/A-A` ("sem falha"). Os dois motores têm
   filosofias opostas de commit.

3. **F-04 é uma falha reproduzida, não teórica.** Para os **mesmos** códigos P/O/A, o card de
   perfil de risco e o gráfico de tendência exibem categorias ERC diferentes. No caso "sem falha"
   `P-A/O-A/A-A`, o trend mostra **HFA 4 (Urgente)** e o card mostra **HFA 1 (Aceitável)** — uma
   contradição máxima. Ver [05-auditoria-erc.md](05-auditoria-erc.md).

4. **Existem pelo menos 4 mecanismos de ERC**, em 2 famílias incompatíveis (ver §ERC abaixo).

5. **Promover o vNext não é "trocar por um classificador melhor".** O vNext é **decisão-humana-
   gated**: ele não classifica automaticamente. Adotá-lo muda o produto de "classificação
   automática" para "estruturação + classificação humana assistida". Isso é central para D1.

## Definições de ERC encontradas

| # | Mecanismo | Arquivo | Entrada | Saída | Em produção? |
|---|---|---|---|---|---|
| 1 | LLM propõe `erc_level` | `sera/all-steps.ts:3865,3903` | narrativa (prompt) | 1–5 motor | **Sim** (base) |
| 2 | `inferDeterministicErcLevel` | `sera/all-steps.ts` | texto+códigos+(1) | 1–5 motor | **Sim** (override) |
| 3 | `inferErcLevel` | `sera/pipeline.ts:285` | texto+códigos | 1–5 motor | **Sim** (fallback) |
| 4 | `computeHfaErcCategoryFromCodes` | `risk-profile/erc.ts:34` | só códigos P/O/A | 1–5 HFA (matriz ARMS) | **Sim** (card) |
| — | `coerceMotorErcToHfaCategory` | `sera/erc-conversion.ts` | `erc_level` armazenado | 1–5 HFA (conversão) | Sim (trend) |
| — | `hfaErcToArmsBarrier` | `sera/erc-presentation.ts` | HFA cat | coluna barreira 1–4 | Sim (apresentação) |

**Famílias incompatíveis:** (1/2/3 → `analyses.erc_level`, usada pelo trend) **vs** (4, recomputa
da dos códigos, usada pelo card). Elas divergem — reproduzido. Nenhuma tem fonte metodológica
validada declarada (F-05); a #4 usa matriz ARMS hardcoded.

## Riscos imediatos que exigem contenção

- **RC-1 (de F-04):** enquanto o card e o trend divergirem, qualquer decisão de priorização de
  risco baseada numa das telas é contraditada pela outra. Contenção sugerida: exibir um único
  número ERC por análise ou rotular ambos como "estimativa não reconciliada" até D3.
- **RC-2 (de F-03/F-05):** um evento sem evidência aparece como "sem falha" **e** com ERC default
  alto (motor 2 → HFA 4 no trend). Contenção: bloquear exibição de ERC quando a classificação
  vier de fallback sem evidência.
- **RC-3 (de F-02/F-06):** o resultado de produção não é canônico e não é rotulado como tal.
  Contenção: rótulo explícito de "estimativa pré-metodológica" na UI comum.

Nenhuma contenção foi aplicada nesta etapa (somente diagnóstico).
