# Reavaliação Contraditória dos Achados F-01..F-14

Legenda de natureza: **[FATO]** comprovado no código · **[REPRO]** falha efetivamente reproduzida
· **[INF]** inferência · **[HIP]** hipótese · **[RISCO]** risco potencial.

---

## F-01 — Isolamento entre tenants → **REFORMULADO + REBAIXADO (P1 → P2)**

**Tentativa de refutação (bem-sucedida na parte de exposição).**

Verificações independentes:
- **49 rotas de API** enumeradas; todas as que tocam dados de tenant usam `requireBearerUser`/
  `requireAdmin` e **service_role**, filtrando por `user.tenantId` **derivado do JWT no servidor**.
- **Nenhuma** rota lê `tenant_id` do corpo/query do cliente (grep negativo vazio) → teste #8
  (tenantId manipulado) **não explora**.
- Rotas "sem filtro na rota" (`org/*`, `risk-profile`, `analyses/risk-profile`) delegam a
  `getRiskProfileSummaryForTenant(tenantId, …)`, cujas queries usam `.eq('tenant_id', tenantId)`
  (`risk-profile/server.ts:376,382,386,391`). [FATO]
- Rotas por ID (`analyses/[id]`, `events/[id]`, vNext `analyses/[id]`) filtram por tenant: o
  repositório vNext faz `.eq('tenant_id', tenantId)` inclusive no fetch por id
  (`repositories.ts:85–89`) → teste #6 (acesso por ID conhecido) **não explora**. [FATO]
- Deleção/restauração via RPCs `security definer` com `and tenant_id = p_tenant_id` em todas as
  cláusulas (`20260609200000_…sql:155,181,208,271,298`) → testes #2/#3 **não exploram**. [FATO]
- **Todas as 14 tabelas** têm `enable row level security` → não há tabela exposta ao anon key.
  [FATO]
- Storage acessado **só** via service_role; path `${userId}/${analysisId}/${arquivo}` → teste #4
  **não explora**. [FATO]
- Cliente browser (`lib/supabase.ts`) só chama `auth.getSession()`; **nenhuma** leitura de dados
  com anon key. [FATO]

**Mecanismo confirmado, efeito refutado:** `get_tenant_id()` lê `jwt.claims ->> 'tenant_id'` (topo)
e o `tenant_id` só existe em `user_metadata`; o hook `custom_access_token` está comentado
(`config.toml:228`). Logo `get_tenant_id()` = NULL e as policies `using (tenant_id = NULL)`
**negam tudo** (fail-closed), não abrem. [FATO/INF sobre a forma do JWT do Supabase]

**Testes de isolamento (matriz em [02-isolamento-tenants.md](02-isolamento-tenants.md)):** as 10
tentativas cruzadas são **bloqueadas** pela camada de aplicação/RPC; a RLS é redundante e inerte.

**Veredito:** exposição cross-tenant **refutada**; RLS-como-defesa-em-profundidade **confirmada
inoperante**. Severidade **P1 → P2**. Confiança: ALTA (exposição), com ressalva de que o projeto
Supabase hospedado poderia ter um hook configurado fora do repo — o que só tornaria a RLS
funcional, nunca menos segura.

---

## F-02 — Produção não usa perguntas canônicas → **CONFIRMADO (P0)**

- `isSeraVNextCanonicalAnalyzeEnabled()` = `env === "true"`; **default false**
  (`feature-flags.ts:1–3,30`). [FATO]
- Com flag off, `analyze/route.ts:351` chama `completeSeraAnalysisAfterEventCreated` →
  `runSeraPipeline` (LLM + heurísticas), **não** a árvore canônica. [FATO]
- Não há refutação: nenhum caminho de produção percorre a árvore canônica por default.
- **Veredito:** CONFIRMADO. Mantém P0.

---

## F-03 — Ausência de evidência vira "sem falha" → **CONFIRMADO + REPRODUZIDO (P0)**

- Fallbacks retornam `P-A`/`O-A`/`A-A` (`pipeline.ts:282,110,300`) e default ERC 2
  (`pipeline.ts:301`). Nenhum eixo emite `UNRESOLVED`. [FATO]
- **[REPRO]** Contraste com vNext (experimento isolado, determinístico): nos 3 casos (sem
  evidência, léxico enganoso, simples) o vNext retorna `UNRESOLVED` / `INSUFFICIENT_EVIDENCE` em
  P, O e A, `humanReviewRequired=true`, `eligibility=NOT_ELIGIBLE`. Saída registrada em
  `evidence-index.csv` (EXP-VNEXT-01).
- Tentativa de refutação: procurou-se um caminho de UNRESOLVED no legado — inexistente para os
  eixos (`grep UNRESOLVED` no `pipeline.ts` só aparece em texto de precondições, não nos códigos).
- **Veredito:** CONFIRMADO; a nuance reforça — os motores têm filosofias **opostas** de commit.

---

## F-04 — ERC não reconciliável → **CONFIRMADO + ELEVADO A FALHA REPRODUZIDA (P1)**

- **[REPRO]** Experimento `erc-divergence.ts`: para os mesmos códigos, `card`
  (`computeHfaErcCategoryFromCodes`) e `trend` (`coerceMotorErcToHfaCategory(erc_level)`) diferem:

  | Códigos | trend (HFA) | card (HFA) | diverge |
  |---|---|---|---|
  | P-C/O-A/A-A | 3 | 2 | **sim** |
  | P-D/O-A/A-A | 3 | 2 | **sim** |
  | P-H/O-A/A-A | 3 | 2 | **sim** |
  | P-A/O-A/A-A | **4 (Urgente)** | **1 (Aceitável)** | **sim** |

- O caso "sem falha" `P-A/O-A/A-A` exibe **alto risco no trend e aceitável no card** —
  contradição máxima, agravada por F-03 (default de ERC alto sem evidência).
- **Veredito:** CONFIRMADO como falha reproduzida. Mantém P1 com nota de reprodução.

---

## F-05 — Índice ERC via matriz ARMS sem fonte → **CONFIRMADO (P1)**

- `risk-profile/erc.ts:3–31`: `ARMS_SEVERITY_ROW` (P-B/P-F→B, P-A→D, default C), matriz
  `ARMS_ERC` 4×4 e `barrierLevel` (contagem de eixos ≠ código "sem falha"), tudo hardcoded, sem
  citação de fonte metodológica. `erc-conversion.ts:12` admite "Neither scale is the ARMS Risk
  Index". [FATO]
- `all-steps.ts:3875` rotula a tabela como "ERC (Error Recovery Characteristics — Hendy 2003)",
  mas os valores por exemplo são atribuídos por regra heurística, não derivados de fórmula
  validada. [FATO]
- **Veredito:** CONFIRMADO. Mantém P1.

---

## F-06 — Governança só no vNext → **CONFIRMADO (P1)**

- Control Board, Authority Index e locks referenciam o vNext; o pipeline legado (produção default)
  não é coberto e diverge (F-02/F-03). [FATO] **Veredito:** CONFIRMADO.

---

## F-07 — Código↔rótulo↔eixo divergente → **CONFIRMADO PARCIALMENTE (P2)**

- `hfacs-mapper.ts:34` mapeia P-C ("Falha de Conhecimento") para **Decision Error** do HFACS,
  embora P-C seja código do eixo **Percepção** em Daumas (Tabela 5). [FATO]
- Refutação parcial: o mapeamento SERA→HFACS **pode** legitimamente cruzar eixos (HFACS tem
  estrutura própria); portanto não é necessariamente erro, mas **divergência a decidir** (D4).
  [INF]
- **Veredito:** CONFIRMADO PARCIALMENTE. Mantém P2; encaminhado a D4 sem correção.

---

## F-08 — Duas escalas ERC invertidas → **CONFIRMADO (P2)**

- Motor 1=crítico vs HFA 5=crítico (`erc-conversion.ts:28–35`); risco de inversão em novas telas.
  [FATO] **Veredito:** CONFIRMADO.

---

## F-09 — Pré-condições truncadas em 5 → **CONFIRMADO (P2)**

- `pipeline.ts:1994–1997` `sanitizePreconditions(..., 5)`. Hendy: "pode haver muitas" (R-06). Sem
  sinalização de truncamento. [FATO] **Veredito:** CONFIRMADO.

---

## F-10 — Amostra pequena / caveat → **REFORMULADO (P2 → P3)**

- Refutação parcial bem-sucedida: há mitigações relevantes — `data-confidence.ts` e o
  **prompt de `org/ai-insight`** impõe linguagem de "perfil em formação" quando <10 análises e
  proíbe probabilidade absoluta. [FATO]
- Resta o card ERC/trend sem o mesmo caveat visual. **Veredito:** REFORMULADO, rebaixado a P3.

---

## F-11 / F-12 / F-14 — **CONFIRMADOS (P3)**

- F-11: 22 warnings de lint (código morto legado). F-12: 8 relatórios de trial modificados no
  working tree (pré-existentes, preservados). F-14: UI comum não informa o motor gerador
  (`vnextNotice` só com flag ligada, `analyze/route.ts:345`). [FATO]

---

## F-13 — LLM na cadeia sem separação → **CONFIRMADO + REFORMULADO (P1 → P2)**

- `pipeline.ts:1949–1970`: os códigos vêm primariamente do LLM (`step3/4/5.codigo`); heurística só
  quando o código do LLM é inválido. Sem marcação de "sugestão até validação". [FATO]
- Refutação parcial: `temperature=0` (`llm.ts:102`) reduz (não elimina) variabilidade; e há
  validação de allowlist de códigos posterior. Não foi possível executar o LLM nesta etapa
  (sem chaves; não determinístico) → risco de divergência entre execuções permanece **[HIP]** não
  reproduzida.
- **Veredito:** CONFIRMADO na estrutura; **rebaixado a P2** por não haver reprodução de
  divergência e existir mitigação parcial. Continua exigindo separação IA/determinístico (D1/D2).
