# Decisão D1 — Motor-alvo de Produção

Documento de decisão arquitetural. **Recomendação técnica ao final; partes que dependem de
decisão autoral/metodológica estão marcadas [AUTORAL].**

## Contexto reproduzido
- Produção default = **legado** (flag canônica off por default — `feature-flags.ts`).
- Legado: classifica automaticamente, mas viola L-01/L-02 (F-02/F-03) e gera índices de risco
  não fundamentados (F-04/F-05).
- vNext: canônico e human-gated; **não** classifica sozinho (EXP-VNEXT-01). Respeita os locks.

## Alternativa A — Manter e corrigir o legado

| Critério | Avaliação |
|---|---|
| Esforço | Médio-alto: introduzir UNRESOLVED, remover keyword-inference, ligar à árvore canônica |
| Risco metodológico | **Alto**: a arquitetura do legado é keyword+LLM; "corrigir" implica reescrever o núcleo de classificação |
| Dívida técnica | Alta (2 heurísticas ERC, código morto, escalas invertidas) |
| Compatibilidade | Alta com dados históricos (mesma escala/tabelas) |
| Rastreabilidade completa | Improvável sem reescrita substancial |
| Custo de manutenção | Alto (heurísticas frágeis a vocabulário) |

**Benefícios:** menor impacto em dados/telas; mantém classificação automática.
**Riscos:** corrigir F-02/F-03 no legado ≈ reconstruir o vNext dentro do legado.

## Alternativa B — Promover o vNext

| Critério | Avaliação |
|---|---|
| Lacunas atuais | **Não auto-classifica**; exige input humano por eixo; downstream/risco locked |
| Integrações faltantes | UI comum não renderiza saída vNext (`analyze/route.ts:345` avisa); relatórios/risk-profile precisam do fluxo human-review |
| Impacto no banco | `sera_vnext_analyses` já existe e é tenant-scoped; coexiste com `analyses` |
| Impacto na interface | Alto: fluxo passa a exigir revisor humano; telas de decisão |
| Compatibilidade c/ casos existentes | Casos históricos do legado não migram automaticamente (semânticas diferentes) |
| Migração | Necessária estratégia p/ histórico (ver [10-plano-transicao.md](10-plano-transicao.md)) |
| Critérios de promoção | Já há gates (`code-release-gate`, human-decision) e governança Tier 0 |

**Benefícios:** fidelidade metodológica, incerteza preservada, locks respeitados, rastreabilidade.
**Riscos:** muda o produto para human-in-the-loop; throughput menor; exige revisores (o piloto já
está bloqueado em 1 revisor — memória `project-sera-vnext-status`).

## Alternativa C — Motor novo / unificação controlada

Só se A e B forem inadequados. B **não** é inadequado (é o motor canônico); A é. Logo, **C não se
justifica** como reconstrução — mas uma **unificação controlada** (vNext como núcleo canônico +
uma camada de "sugestão assistiva por IA" claramente rotulada, alimentando o gate humano do vNext)
é uma sub-opção de B, não um motor novo.

| Critério | Avaliação (unificação B+IA-assistiva) |
|---|---|
| Adequação metodológica | Alta (núcleo canônico) com ganho de throughput (IA sugere, humano decide) |
| Risco | Médio: exige separar rigorosamente IA-sugestão de decisão (F-13) |
| Pré-requisitos | vNext promovido + contrato de sugestão + schema de validação |

## Recomendação técnica

**Adotar a Alternativa B (promover o vNext como motor canônico), com a sub-opção de unificação
B+IA-assistiva**, executada via **shadow mode** antes de qualquer substituição (plano em
[10-plano-transicao.md](10-plano-transicao.md)). Justificativa técnica:

- Corrigir o legado (A) para atingir fidelidade equivale a reconstruir o vNext — esforço similar,
  com dívida técnica preservada.
- O vNext já implementa perguntas canônicas, incerteza, locks e rastreabilidade **reproduzidos**.
- A principal lacuna do vNext (não auto-classificar) é **intencional** e resolvida pelo modelo
  human-in-the-loop + IA assistiva rotulada.

### Dependências [AUTORAL]
- **[AUTORAL/metodológico]** Aceitar que o produto passe a ser *classificação assistida com
  decisão humana* (não automática). É uma decisão de negócio + metodológica.
- **[AUTORAL]** Definir se o legado é **congelado** (read-only histórico) ou **desativado**.
- **[AUTORAL]** Política para reclassificar (ou não) o histórico do legado.
- **[AUTORAL]** Se D3 remover o índice de risco até validação, o perfil de risco muda de forma.

## O que NÃO decidir agora
Não promover nada nesta etapa (sem alteração de flag/código). D1 é uma **recomendação**; a
promoção exige prompt/decisão explícita e o plano de transição.
