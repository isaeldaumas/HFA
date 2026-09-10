# Auditoria Forense HFA/SERA — Resumo Executivo

**Data:** 2026-07-09/10
**Branch de auditoria:** `auditoria-hfa-20260709`
**Commit inicial (HEAD):** `315eac1a4728346dc893d6b09e7c9e91a4e000f6` (branch `main`)
**Runtime:** Node v26.0.0 / npm 11.12.1 / Next.js 16.2.5 / React 19.2.4 / TypeScript 5
**Auditor:** Claude (Fable 5), sob locks da skill `sera-safe-phase`

> Esta auditoria é **não destrutiva e read-only sobre metodologia**. Nenhum arquivo de
> código, fixture, baseline, migration ou motor foi alterado. Os locks metodológicos
> vigentes (canonical question lock, P/O/A at escape point, O-E `NON_EXISTENT`,
> `NO_RELEASED_CODE`, `NO_DOWNSTREAM`) proíbem correção automática de decisões de
> classificação; achados metodológicos são **documentados e encaminhados para decisão
> autoral**, não corrigidos silenciosamente.

---

## 1. Situação geral do sistema

O HFA é, na prática, **dois sistemas SERA distintos convivendo no mesmo repositório**:

1. **Pipeline de produção (`frontend/src/lib/sera/`)** — é o runtime que efetivamente roda
   quando um usuário submete uma análise (`POST /api/analyze` com a flag vNext desligada,
   que é o **default**). Classifica P/O/A combinando um LLM (DeepSeek por padrão,
   temperatura 0) com **heurísticas de correspondência de palavras-chave em português**
   (`inferPerceptionCode`, `inferObjectiveCode`, `inferActionCode`, `inferErcLevel`).

2. **Motor vNext (`frontend/src/lib/sera-vnext*`)** — implementa a árvore canônica de
   perguntas SERA, o escape point, códigos canônicos e emite `UNRESOLVED`/
   `INSUFFICIENT_EVIDENCE`. É **candidate-only**, protegido por feature flag desligada por
   padrão, e por decisão formal **não tem `releasedCode`, downstream, HFACS, risco ou
   recomendações liberados**.

Toda a governança metodológica documentada (Control Board A4R135, Canonical Method Question
Lock, Document Authority Index) refere-se ao **motor vNext**. O **pipeline de produção que
o usuário realmente usa não passou por essa governança** e implementa a metodologia de forma
divergente das fontes (Hendy/Daumas) e dos próprios locks do projeto.

## 2. Nível de confiança atual

| Dimensão | Confiança | Base |
|---|---|---|
| Build / tipos / lint | **Alta** | `tsc` 0 erros, `next build` OK, ESLint 0 erros (22 warnings) |
| Regressão vNext (trials locais) | **Alta** | 161/161 PASS, 1 GATE `NOT_READY` esperado, 43 trials pulados por exigirem ambiente externo (Supabase/servidor) |
| Isolamento multi-tenant (camada de aplicação) | **Média-alta** | filtros por `tenant_id` consistentes nas rotas via service_role |
| Isolamento multi-tenant (RLS / defesa em profundidade) | **Baixa** | `get_tenant_id()` lê claim JWT que nunca é populado (F-01) |
| Fidelidade metodológica do runtime de produção | **Baixa** | keyword-inference força P-A/O-A/A-A; sem UNRESOLVED; sem escape-point canônico (F-02, F-03) |
| Reconciliação de números de risco (ERC) | **Baixa** | três derivações de ERC divergentes coexistem (F-04, F-05) |
| Fidelidade metodológica do motor vNext | **Média** | árvore canônica presente e testada, mas ainda candidate-only e não liberada |

## 3. Principais riscos

- **P0-01 — O runtime de produção não implementa a metodologia SERA canônica.** A
  classificação P/O/A do fluxo que o usuário usa vem de heurísticas de palavra-chave + LLM,
  não da árvore de perguntas de Hendy. Isso é exatamente a "substituição não canônica" que o
  Canonical Method Question Lock classifica como `METHODOLOGY_VIOLATION`.
- **P0-02 — Ausência de evidência é convertida em "nenhuma falha".** Quando não há sinal, o
  pipeline retorna `P-A` (avaliação correta), `O-A` (sem violação) e `A-A` (ação correta) como
  fallback. Nunca emite `UNRESOLVED`. Viola a "Insufficient Evidence Rule" do lock e o
  princípio da auditoria de que ausência de informação ≠ ausência do fator.
- **P1-04/05 — Índices de risco (ERC) não são reconciliáveis nem validados.** O mesmo evento
  pode receber categorias ERC diferentes no card de perfil de risco e no gráfico de tendência,
  porque são calculados por fórmulas distintas (matriz ARMS a partir dos códigos vs. conversão
  do `erc_level` heurístico). A matriz ARMS de severidade é hardcoded sem fonte metodológica
  declarada — o tipo de "fórmula conceitual apresentada como índice" que Hendy alertou não usar.
- **P1-01 — RLS não fornece isolamento real.** O isolamento depende inteiramente da camada de
  aplicação (service_role bypassa RLS). Qualquer consulta client-side futura ou rota que
  esqueça o filtro `tenant_id` não tem backstop.

## 4. Quantidade de achados por severidade

| Severidade | Quantidade |
|---|---|
| P0 — Crítico | 2 |
| P1 — Alto | 5 |
| P2 — Médio | 4 |
| P3 — Baixo | 3 |
| **Total** | **14** |

Detalhamento em [03-achados.md](03-achados.md) e [findings.json](findings.json).

## 5. Componentes mais frágeis

1. `frontend/src/lib/sera/pipeline.ts` — heurísticas de inferência P/O/A e ERC (F-02, F-03, F-05).
2. `frontend/src/lib/risk-profile/erc.ts` + `erc-conversion.ts` + `risk-quality-trend.ts` — três escalas ERC (F-04, F-05).
3. `supabase/migrations/20260507120000_rls_policies.sql` — `get_tenant_id()` inoperante (F-01).
4. Fronteira legado ↔ vNext — governança aplicada só a um dos dois motores (F-06).

## 6. Conclusão sobre fidelidade metodológica

O **motor vNext** demonstra fidelidade metodológica razoável às fontes (árvore canônica de
Hendy, escape point, códigos, estados de incerteza), mas **ainda não é o que roda em
produção**. O **pipeline de produção** diverge materialmente das fontes: não usa a árvore
canônica, força classificações "sem falha" na ausência de evidência e produz índices de risco
não fundamentados. **Para o fluxo que o usuário efetivamente executa, o sistema não pode ser
considerado metodologicamente fiel.**

## 7. Conclusão sobre confiabilidade dos resultados

Resultados de P/O/A do fluxo de produção **não são plenamente reproduzíveis nem explicáveis por
evidência**: parte vem de LLM (não determinístico apesar de `temperature=0`) e parte de
palavras-chave que não têm âncora nas perguntas canônicas. Os números de risco **não são
reconciliáveis** entre telas. O motor vNext é reprodutível e rastreável, mas está bloqueado
para uso operacional por decisão formal.

## 8. Conclusão sobre prontidão para uso real

- **Motor vNext:** pronto para pilotos supervisionados com revisor humano; **não** pronto para
  decisão operacional autônoma (candidate-only, sem downstream por decisão do projeto).
- **Pipeline de produção legado:** **não recomendado** para produção de conclusões
  metodológicas ou de risco sem correção dos achados P0/P1, dado que classifica sem base
  canônica, não preserva incerteza e emite índices de risco não validados.

Ver [06-riscos-residuais.md](06-riscos-residuais.md) e [07-plano-validacao.md](07-plano-validacao.md).
