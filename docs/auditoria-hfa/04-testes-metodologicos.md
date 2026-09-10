# Testes Metodológicos — Execução e Suíte de Referência

## 1. Comandos executados nesta auditoria (não destrutivos)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (frontend) | **PASS** — 0 erros |
| `npm run lint` (frontend) | **PASS** — 0 erros, 22 warnings (F-11) |
| `npm run build` (frontend) | **PASS** |
| Regressão vNext (161 trials sem env externo, `env` mínimo) | **161 PASS / 1 GATE NOT_READY (esperado) / 43 SKIP_ENV** |

- Runner seguro usado: `scratchpad/run-safe-regression.mjs` (mesma lógica de
  `scripts/run-sera-vnext-regression.ts`, mas sem `.env.local`, `env` reduzido, timeout 180s).
- O único `NOT_READY` é `engine-validation-v03-naturalistic/run-all.ts` emitindo
  `ENGINE_NATURALISTIC_VALIDATION_NOT_READY` — status **esperado** conforme o próprio manifesto
  (`expectedStatus: NOT_READY`).
- Os **43 SKIP_ENV** exigem `LOCAL_FRONTEND_SERVER` (servidor Next rodando) e/ou
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Supabase real). Não executados por
  não haver ambiente externo autorizado nesta fase — inclui os trials de isolamento de tenant
  (`REAL_DB`/`REAL_API`), o que deixa **F-01 sem validação dinâmica**.

## 2. Avaliação crítica dos testes existentes

Os testes vNext são numerosos (205 no manifesto: 83 UNIT, 42 CONTRACT, 33 STATIC, 18 REAL_API,
16 REAL_UI, 9 REAL_DB, 4 GATE) e cobrem bem o **motor candidate-only**: códigos canônicos,
traversal da árvore, escape point, O-E proibido, gates de release.

**Porém, conforme o princípio da auditoria, testes não são fonte da verdade automática:**

- Nenhum teste do RT de produção falha quando o pipeline emite `P-A/O-A/A-A` por falta de
  evidência (F-03). Os testes validam que "um código sai", não que o código é metodologicamente
  correto na ausência de evidência.
- Não há teste de reconciliação numérica entre `computeHfaErcCategoryFromCodes` (card) e
  `coerceMotorErcToHfaCategory(erc_level)` (trend) — a divergência F-04 passa despercebida.
- O isolamento de tenant é testado apenas via trials que exigem Supabase real; a função RLS
  `get_tenant_id()` nunca é exercida com um JWT real nesses testes locais (F-01).

## 3. Suíte de casos de referência proposta (independente do código atual)

Definida de acordo com a Fase 3 da auditoria. Para cada caso: entrada, evidências,
classificações aceitáveis/inaceitáveis e critério de aprovação. **Recomendada para implementação
após decisão autoral sobre qual motor é o de produção** (não implementada aqui para não presumir
a decisão de F-02/F-06).

| # | Caso | Classificação aceitável | Inaceitável | Critério-chave |
|---|---|---|---|---|
| 1 | 1 falha ativa + 1 pré-condição | eixo correto + ≥1 pré-condição | "sem falha" | rastreável à evidência |
| 2 | Múltiplos atos inseguros | múltiplos P/O/A por ato | 1 único código global | multifatorialidade |
| 3 | Múltiplas falhas ativas | várias ladders | colapso em uma | R-05 |
| 4 | Multifatorial (indiv/equipe/superv/org) | pré-condições nos 4 níveis | só nível imediato | R-02 |
| 5 | Fadiga | pré-condição de pessoal (P5) | ignorada | R-02 |
| 6 | Comunicação/CRM | P-H + pré-condição equipe | P-A | R-01 |
| 7 | Pressão operacional | O-D / pré-condição tarefa | O-A | R-04 |
| 8 | Falha de planejamento organizacional | pré-condição org/CCS | só imediato | R-02 |
| 9 | Erro de percepção | P-B/P-C/P-F conforme evidência | P-A | R-05 |
| 10 | Erro de decisão | A-E / O-* | A-A | R-05 |
| 11 | Erro de memória | A-B (lapse) | A-F | R-01 |
| 12 | Execução inadequada | A-F/A-C | A-A | R-05 |
| 13 | Informação incompleta | UNRESOLVED nos eixos sem evidência | P-A/O-A/A-A | **L-02 (F-03)** |
| 14 | Informação contraditória | flag "informação contraditória" | escolha silenciosa | 3.4 |
| 15 | Sem evidência suficiente | **UNRESOLVED** | P-A/O-A/A-A | **L-02 (F-03)** |
| 16 | Fator fora da taxonomia | registro de fator externo | forçar código | 3.6 |
| 17 | Revisão por outro analista | versão + trilha | sobrescrita | 3.5 |
| 18 | Reaberto com nova evidência | reprocessa + versiona | duplica | invariante |
| 19 | Evento duplicado | detecção/merge | dupla contagem | invariante |
| 20 | Narrativas semelhantes, eventos distintos | classificações independentes | contexto vazado | 3.8 |
| 21 | IA sugere classificação incorreta | humano corrige; IA=sugestão | IA decide | 3.8 (F-13) |
| 22 | Correto ≠ mais próximo lexicalmente | código por evidência | keyword match | **F-02** |
| 23 | Barreira existente mas ineficaz | registra barreira degradada | ignora | 3.3 |
| 24 | Barreira ausente | registra ausência | trata como presente | 3.3 |
| 25 | Sem consequência grave, alto potencial | severidade por potencial | severidade=0 | 3.7 |
| 26 | Grave sem recorrência | não inflar tendência | tendência falsa | R-10 |
| 27 | Amostra pequena | caveat de amostra | tendência consolidada | R-10 (F-10) |
| 28 | Import/export sem perda | round-trip idêntico | perda de campo | invariante |
| 29 | Relatório após revisões | reflete versão atual | versão antiga | invariante |
| 30 | Tela × API × banco × relatório | valores idênticos | divergência | **F-04** |

## 4. Testes que não puderam ser executados / limitações do ambiente

- 43 trials `REAL_DB`/`REAL_API`/`REAL_UI` (Supabase + servidor local) — sem ambiente externo.
- Comportamento do LLM (F-13) não exercido — exigiria chaves de provider e é não determinístico.
- RLS com JWT real (F-01) — exige projeto Supabase de staging.
