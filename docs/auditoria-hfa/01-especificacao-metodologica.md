# Especificação Metodológica Reconstruída (SERA/HFA)

Reconstruída a partir das fontes, na ordem de precedência definida pela tarefa e pela skill
`sera-safe-phase`. As citações de página referem-se aos PDFs em `metodologia/` extraídos com
`pdftotext -layout`.

## Fontes consultadas

| # | Fonte | Papel |
|---|---|---|
| S1 | Hendy, K. C. — *A tool for Human Factors Accident Investigation, Classification and Risk Management* (DRDC Toronto TR 2002-057, 128 p.) | Processo, taxonomia e fundamentos do SERA |
| S2 | Daumas, F. — *Análise de Fatores Humanos em Incidentes na Aviação Offshore* (dissertação, 145 p.) | Aplicação conjunta MDC+SERA; operacionalização PT dos códigos P/O/A |
| S3 | `docs/sera-vnext/SERA_ENGINE_VNEXT_CANONICAL_METHOD_QUESTION_LOCK_v0.2.0.md` (Tier 0) | Lock canônico de perguntas |
| S4 | `docs/sera-vnext/SERA_ENGINE_VNEXT_METHODOLOGY_CONTROL_BOARD_A4R135_v0.2.0.md` (Tier 0) | Governança e status metodológico |
| S5 | `docs/sera-vnext/SERA_ENGINE_VNEXT_DOCUMENT_AUTHORITY_INDEX_v0.2.0.md` (Tier 0) | Hierarquia de autoridade documental |

## Fundamentos (Hendy, S1)

O SERA baseia-se no Modelo de Falhas Latentes de Reason e no processamento de informação /
teoria do controle perceptual (IP/PCT). Reconhece **atos inseguros** e as **pré-condições** que
os tornam mais prováveis (S1, p.11–13).

### R-01 — Doze falhas ativas canônicas (S1, p.11)

As decision ladders (Figura 5, PCATCT) conduzem a **doze tipos básicos de falha ativa**:
Intent, Attention, Sensory, Knowledge(Perception), Perception, Communication/Information,
Time Management, Knowledge(Decision), Ability to Respond, Action Selection, Slips/Lapses/Mode
Errors, Feedback. As definições detalhadas estão no Anexo A.

### R-02 — Quatro níveis do Modelo de Falhas Latentes (S1, p.12)

1. **Falhas ativas** — os 12 pontos de ruptura no processamento humano de informação.
2. **Pré-condições imediatas** — condição do pessoal (WHO), condição da tarefa
   (pressão de tempo, objetivos — WHAT/WHY) e condições de trabalho (equipamento, espaço,
   ambiente — WHERE). Baseadas no modelo SHEL.
3. **Influências organizacionais** — fatores remotos (recursos, clima, processos, gestão).
4. **Falhas de Comando, Controle e Supervisão** — formação/comunicação de metas e feedback
   corretivo; conduíte entre a camada organizacional e as pré-condições imediatas.

### R-03 — STEP 1: Identificar o ato/condição insegura (S1, p.69)

A análise parte de um ato inseguro ou condição insegura observável. (No HFA/vNext isto é o
**escape point**: "o primeiro momento de saída da operação segura", formulado com "quando…",
**sem embutir causa** — lock da skill e S3.)

### R-04 — STEP 2: Três perguntas por ato inseguro (S1, p.70)

- **GOAL (Objetivo):** "What was the operator trying to achieve… what was the intent or goal(s)
  that led to the unsafe act?"
- **PERCEPTION (Percepção):** "What did the operator believe was the state of the world with
  respect to the goal(s)?"
- **ACTION (Ação):** "How was the operator trying to achieve the goal(s)?"

Regras (S1, p.70): as três afirmações devem ser **objetivas**, no mesmo nível de descrição, sem
colorir com pré-condições ou falhas ativas, sem pré-julgar. **P/O/A é analisado no momento do
ato inseguro / escape point**, não a partir de eventos posteriores (reforçado por S3/S4 e pelo
lock A4R137 "P/O/A at escape point").

### R-05 — STEPS 3–5: Descer as decision ladders (S1, p.71–95)

Para cada eixo, seguir a série de perguntas dos pontos de decisão até a(s) falha(s) ativa(s).
Normalmente começa-se pela PERCEPÇÃO (contexto das metas). Um objetivo de alto nível pode gerar
**múltiplas falhas ativas** em uma ou mais ladders (multifatorialidade — S1, p.71).

### R-06 — Identificar pré-condições (S1, p.71)

Após as falhas ativas, buscar pré-condições que as tornaram mais prováveis. Teste contrafactual:
"o desfecho seria diferente se esta condição estivesse ausente ou diferente?". **Pelo menos uma
pré-condição por falha ativa; pode haver muitas.** Os pontos de intervenção são definidos pelas
**pré-condições**, não pelas falhas ativas (que são propriedades fixas do humano).

### R-07 — Atos inseguros de supervisores como pré-condições recursivas (S1, p.71–72)

Uma pré-condição pode ser o ato inseguro de um supervisor/organização, que **pode ser
analisado com o processo SERA completo** (três perguntas para o supervisor). Suporta cadeia
causal recursiva e multi-ator.

### R-08 — Gestão de risco é conceitual e não validada (S1, resumo, p.33–39)

Hendy apresenta um **conceito** de ferramenta de risco (tático/estratégico) baseado nos 12
fatores, e afirma explicitamente que as formulações **necessitavam de validação antes do uso
operacional**. Índices de risco não devem ser apresentados como comprovados.

## Operacionalização PT dos códigos P/O/A (Daumas, S2)

A dissertação aplica os códigos com rótulos em português (tabelas 5–17). Mapeamento observado:

| Código | Rótulo (Daumas) | Eixo |
|---|---|---|
| O-A | Nenhuma Falha de Intenção | Objetivo |
| O-B | Falha de Intenção (Violação de Rotina) | Objetivo |
| O-C | Falha de Intenção (Violação Excepcional) | Objetivo |
| O-D | Falha de Intenção (Não Violação) | Objetivo |
| P-A | Avaliação correta/adequada | Percepção |
| P-B | Falha Sensorial (capacidade) | Percepção |
| P-C | Falha de Conhecimento/Percepção | Percepção |
| P-D | Falha de Atenção (pressão de tempo externa) | Percepção |
| P-E | Falha no Gerenciamento do Tempo | Percepção |
| P-F | Informação Ilusória/Ambígua | Percepção |
| P-G | Falha de Atenção (interna/complacência) | Percepção |
| P-H | Falha de Comunicação | Percepção |
| A-E | Falha de Conhecimento (Decisão) | Ação |
| A-F | Falha na Seleção da Ação | Ação |
| A-G | Falha de Feedback | Ação |
| A-H | Falha no Gerenciamento do Tempo | Ação |

> **Divergência de fonte registrada (não resolver silenciosamente):** Daumas coloca "Falha de
> Conhecimento/Decisão" no código **A-E** (eixo Ação, Tabela 6), enquanto Hendy lista
> "Knowledge (Decision) Failure" como uma das 12 falhas. O sistema precisa de decisão autoral
> sobre a alocação exata código↔eixo↔rótulo, pois há três representações no repositório
> (failure-names legado, hfacs-mapper legado, códigos canônicos vNext). Ver F-07.

### R-09 — MDC + SERA (Daumas, S2)

Daumas usa o **MDC** para aprofundamento cognitivo/reconstrução da situação vivida e o **SERA**
como guia de análise e classificação taxonômica; a associação revela fatores ativos,
pré-condições e aspectos organizacionais, e estrutura os dados para banco/comparação. As duas
técnicas são **distintas e complementares** e não podem ser reduzidas a um formulário genérico.

### R-10 — Amostra pequena não define perfil de risco (Daumas, S2)

Daumas avaliou quatro eventos e reconheceu que **não bastam** para definir um perfil de risco
da atividade. O sistema deve informar tamanho de amostra, limitações e não transformar poucos
eventos em tendência consolidada.

## Locks metodológicos vigentes (S3/S4/S5 + skill)

- **L-01** Só perguntas canônicas SERA/Hendy conduzem P/O/A; nenhuma pergunta inventada/adaptada
  as substitui (S3). Violação ⇒ `METHODOLOGY_VIOLATION` / `REWORK_REQUIRED`.
- **L-02** Evidência insuficiente ⇒ `UNRESOLVED`/`HOLD`; **não forçar fechamento**; não inferir
  de causa provável/consequência (S3, "Insufficient Evidence Rule").
- **L-03** Escape point é o primeiro momento de saída da operação segura, formulado com
  "quando…", sem embutir causa/violação/código/warning (S3 §Supreme Rules; skill).
- **L-04** P/O/A analisado **no** escape point; não usar eventos posteriores (A4R137).
- **L-05** `O-E` é `NON_EXISTENT_IN_SERA_PT_V1` (skill + `canonical-codes.ts`).
- **L-06** `proposedCode ≠ releasedCode`; sem conversão automática (S3/S4).
- **L-07** Sem downstream/HFACS/Risk-ERC/ARMS-ERC/recomendações sem governança separada
  explícita (S3 §Lock Preservation).
- **L-08** Precedência de fontes: decisões formais do projeto > MDC+SERA (Daumas) > SERA (Hendy)
  > ARMS/ICAO/ANAC/FAA quando usados > doc técnica > código > testes.
