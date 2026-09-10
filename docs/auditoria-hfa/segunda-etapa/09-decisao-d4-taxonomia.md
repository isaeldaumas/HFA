# Ficha de Decisão D4 — Códigos, Rótulos e Eixos

**Não corrigir silenciosamente divergências entre fontes.** Esta ficha só as registra.

## Divergências observadas (legado `failure-names.ts` × Daumas × vNext × HFACS-mapper)

| Código | Eixo | Rótulo legado (`failure-names.ts`) | Daumas | Observação / divergência |
|---|---|---|---|---|
| P-A | Percepção | Nenhuma Falha de Percepção | Avaliação correta/adequada | ok |
| P-B | Percepção | Falha Sensorial | Falha Sensorial (capacidade) | ok |
| P-C | Percepção | Falha de Conhecimento/Percepção | Falha de Conhecimento/Percepção | **hfacs-mapper mapeia P-C → HFACS Decision Error** (cruzamento de eixo) — F-07 |
| P-D | Percepção | **Falha de Atenção** | Falha de Atenção (pressão de tempo externa) | **rótulo idêntico a P-G** — perde a distinção D/G |
| P-E | Percepção | **Falha no Gerenciamento do Tempo** | Falha no Gerenciamento do Tempo | **rótulo idêntico a A-H** (eixo diferente) |
| P-F | Percepção | **Falha de Percepção** | Informação Ilusória/Ambígua | **rótulo diverge de Daumas** (genérico vs "ilusória/ambígua") |
| P-G | Percepção | **Falha de Atenção** | Falha de Atenção (interna/complacência) | rótulo idêntico a P-D |
| P-H | Percepção | Falha de Comunicação | Falha de Comunicação | ok |
| O-A | Objetivo | Nenhuma Falha de Objetivo | Nenhuma Falha de Intenção | rótulo "Objetivo" vs "Intenção" |
| O-B | Objetivo | Violação Rotineira | Falha de Intenção (Violação de Rotina) | ok |
| O-C | Objetivo | Falha de Intenção / Violação Excepcional | Violação Excepcional | ok |
| O-D | Objetivo | Falha de Intenção (Não Violação) | idem | ok |
| A-A | Ação | Nenhuma Falha de Ação | — | ok |
| A-B | Ação | Deslizes, Omissões e Lapsos | (lapse/omissão) | ok |
| A-C | Ação | Falha no Feedback da Execução | — | **quase-duplicata de A-G** |
| A-D | Ação | Inabilidade para a Resposta | Ability to Respond (Hendy) | ok |
| A-E | Ação | Falha de Conhecimento/Decisão | Falha de Conhecimento (Decisão) | **Hendy lista "Knowledge (Decision)" entre as 12; alocação eixo A vs P a decidir** |
| A-F | Ação | Falha na Seleção da Ação | Falha na Seleção da Ação | ok |
| A-G | Ação | Falha de Feedback | Falha de Feedback | quase-duplicata de A-C |
| A-H | Ação | Falha no Gerenciamento do Tempo | idem | rótulo idêntico a P-E |
| A-I | Ação | Falha na Seleção da Ação por Pressão do Tempo | — | variante de A-F |
| A-J | Ação | Falha de Feedback por Pressão do Tempo | — | variante de A-G |

## Pontos que exigem decisão [AUTORAL/metodológico]
1. **Rótulos ambíguos idênticos:** P-D=P-G="Falha de Atenção"; P-E=A-H="Falha no Gerenciamento do
   Tempo". Decidir rótulos distintivos preservando o significado de cada código.
2. **P-F:** "Falha de Percepção" (legado) vs "Informação Ilusória/Ambígua" (Daumas). Alinhar.
3. **P-C → HFACS:** manter mapeamento para Decision Error (cruzamento de eixo legítimo?) ou
   revisar (F-07).
4. **A-E "Knowledge (Decision)":** confirmar alocação no eixo Ação (legado/Daumas) vs a leitura
   de Hendy. **Divergência de fonte registrada — requer decisão autoral, não correção.**
5. **Quase-duplicatas A-C/A-G:** confirmar diferença semântica (feedback da execução vs feedback)
   e refletir nos rótulos.

## Referência canônica no vNext
Os códigos canônicos e a árvore (`canonical-codes.ts`, `canonical-tree.ts`) devem ser a **fonte
única** de código↔eixo↔rótulo↔pergunta após D4; `failure-names.ts` e `hfacs-mapper.ts` seriam
derivados versionados, não definições paralelas.
