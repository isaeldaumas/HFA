# Registro de Achados

Severidades: **P0** crítico · **P1** alto · **P2** médio · **P3** baixo.
Nível de confiança do achado indicado ao final de cada item.

Cada achado cita `arquivo:linha` verificáveis no commit `315eac1a`.

---

## P0 — Críticos

### F-02 (P0) — Runtime de produção não usa a árvore de perguntas canônica SERA

- **Requisito afetado:** R-03, R-04, R-05, L-01.
- **Fonte:** Hendy STEP 2–5 (S1 p.70–95); Canonical Method Question Lock (S3).
- **Arquivo/linhas:** `frontend/src/lib/sera/pipeline.ts:210–301` (`inferPerceptionCode`,
  `inferObjectiveCode`, `inferActionCode`, `inferErcLevel`); `frontend/src/lib/sera/llm.ts`.
- **Esperado:** P/O/A conduzido pelas perguntas canônicas das decision ladders, no escape point.
- **Observado:** o fluxo de produção (`POST /api/analyze` com flag vNext desligada — default)
  determina P/O/A por (a) chamada LLM e (b) heurísticas de **substring de palavras-chave em
  português** (ex.: `hasAny(t, ['complacencia','familiaridade','nao verificou'])` ⇒ `P-G`).
  Nenhuma pergunta canônica é percorrida.
- **Reprodução:** `analyze/route.ts:301` — `isSeraVNextCanonicalAnalyzeEnabled()` é `false` por
  padrão ⇒ cai em `completeSeraAnalysisAfterEventCreated` ⇒ `runSeraPipeline` (heurísticas).
- **Impacto:** o Canonical Method Question Lock classifica substituição não canônica como
  `METHODOLOGY_VIOLATION`. A classificação apresentada ao usuário não é derivada da metodologia.
- **Causa raiz:** o pipeline legado antecede a governança canônica; a governança foi aplicada só
  ao vNext, que permanece candidate-only.
- **Correção recomendada:** decisão autoral — promover o vNext ao fluxo de produção sob revisão
  humana, OU marcar explicitamente o resultado legado como "pré-metodológico/estimativa" na UI e
  bloquear seu uso para conclusões. **Não corrigir automaticamente** (envolve promover motor).
- **Testes necessários:** teste de contrato que, com flag desligada, o resultado seja rotulado
  como não canônico; e que perguntas canônicas sejam a única base de P/O/A quando canônico.
- **Risco de regressão:** alto (muda o motor de produção). **Confiança do achado: ALTA.**

### F-03 (P0) — Ausência de evidência é convertida em "nenhuma falha" (sem UNRESOLVED)

- **Requisito afetado:** L-02 (Insufficient Evidence Rule); princípio 3.4 da auditoria
  (ausência de informação ≠ ausência do fator).
- **Fonte:** Canonical Method Question Lock (S3): evidência insuficiente ⇒ `UNRESOLVED`/`HOLD`.
- **Arquivo/linhas:** `frontend/src/lib/sera/pipeline.ts:282` (`return … : 'P-A'`), `:110`
  (`… : 'O-A'`), `:300` (`return 'A-A'` fallback), `:285–301` (`inferErcLevel` default `2`).
- **Esperado:** quando não há evidência canônica suficiente, emitir `UNRESOLVED`/`HOLD` e não
  fechar o eixo.
- **Observado:** os fallbacks retornam **`P-A` (avaliação correta), `O-A` (sem violação de
  intenção) e `A-A` (ação correta)** — ou seja, "nenhuma falha presente" — sempre que o sinal é
  insuficiente. O pipeline **nunca** emite `UNRESOLVED` para os eixos. `computeCompleteness`
  (`:2025`) marca "complete" porque as funções sempre produzem um código válido.
- **Impacto:** um evento com evidência insuficiente é silenciosamente classificado como "sem
  falha", que é uma **conclusão metodológica falsa** — exatamente o que a auditoria proíbe.
- **Contraste (vNext, correto):** `sera-vnext/canonical-tree/run-evidence-traversal.ts:83` emite
  `UNRESOLVED`/`INSUFFICIENT_EVIDENCE`.
- **Correção recomendada:** introduzir estados `UNRESOLVED`/`INSUFFICIENT_EVIDENCE` no pipeline
  legado (ou desativá-lo para produção). Decisão autoral por afetar semântica de classificação.
- **Testes necessários:** caso de referência #15 (evento sem evidência suficiente) deve produzir
  UNRESOLVED, não P-A/O-A/A-A. **Confiança do achado: ALTA.**

---

## P1 — Altos

### F-01 (P1) — RLS não isola tenants: `get_tenant_id()` lê claim JWT inexistente

- **Requisito afetado:** isolamento entre organizações (seção 4 da auditoria; invariante
  "dados de uma organização não aparecem em outra").
- **Arquivo/linhas:** `supabase/migrations/20260507120000_rls_policies.sql:7–18`
  (`get_tenant_id()` lê `request.jwt.claims ->> 'tenant_id'` no **topo**);
  `supabase/config.toml:228` (`[auth.hook.custom_access_token]` **comentado**);
  `frontend/src/app/api/auth/register/route.ts:102` (grava `tenant_id` em **`user_metadata`**).
- **Esperado:** políticas RLS restringem linhas por tenant de forma independente da aplicação.
- **Observado:** o `tenant_id` só existe em `user_metadata`; no JWT do Supabase ele fica
  aninhado sob o claim `user_metadata`, **não** no topo nem em `app_metadata`. Sem o
  `custom_access_token` hook (comentado), `get_tenant_id()` retorna **NULL** para todos. Logo
  `using (tenant_id = get_tenant_id())` ⇒ `tenant_id = NULL` ⇒ sempre falso. A função vNext
  (`20260607135727…:11–17`) tenta `app_metadata.tenant_id`/topo/`get_tenant_id()` — também
  não populados.
- **Mitigação existente:** as leituras/gravações reais usam **service_role** (bypassa RLS) com
  filtro `tenant_id` na aplicação (verificado em `api/analyze/route.ts`, `risk-profile/route.ts`,
  `lib/risk-profile/server.ts`). O cliente browser (`lib/supabase.ts`) só faz `auth.getSession()`.
- **Impacto:** **não há exposição cross-tenant hoje** pelo caminho atual, mas a RLS — a camada
  de defesa em profundidade — está **inoperante**. Qualquer consulta client-side futura com
  anon key, ou rota que esqueça o filtro `tenant_id`, não teria backstop (fail-open naquele
  ponto). Também é enganoso: o repositório aparenta ter isolamento RLS que não funciona.
- **Correção recomendada (fora do escopo desta fase — mexe em migration):** habilitar o
  `custom_access_token` hook que promove `tenant_id` para o topo/`app_metadata`, ou reescrever
  `get_tenant_id()` para ler `#>> '{user_metadata,tenant_id}'`. Exige decisão + teste de
  isolamento com JWT real. **Confiança do achado: ALTA** (verificação estática; recomenda-se
  confirmação com um JWT emitido em staging).

### F-04 (P1) — Três derivações de ERC divergentes; números de risco não reconciliáveis

- **Requisito afetado:** Fase 5 (todo número reconciliável); R-08.
- **Arquivos:**
  - `frontend/src/lib/sera/pipeline.ts:285` `inferErcLevel` → grava `analyses.erc_level`
    (escala motor 1=crítico).
  - `frontend/src/lib/sera/risk-quality-trend.ts:13` usa `coerceMotorErcToHfaCategory(erc_level)`
    (converte o `erc_level` armazenado) para o **gráfico de tendência**.
  - `frontend/src/lib/risk-profile/erc.ts:34` `computeHfaErcCategoryFromCodes` recomputa a
    categoria ERC via matriz **ARMS severidade×barreira a partir dos códigos P/O/A**, ignorando
    o `erc_level` armazenado — usado no **card de perfil de risco**.
- **Esperado:** uma única definição de categoria ERC, reconciliável entre telas, banco e relatório.
- **Observado:** o card de perfil de risco e o gráfico de tendência derivam a "categoria ERC" do
  **mesmo evento** por caminhos diferentes e com entradas diferentes (códigos vs. `erc_level`).
  Podem divergir para o mesmo registro.
- **Impacto:** dashboards inconsistentes; divergência silenciosa entre indicadores — proibida
  pela Fase 5. **Confiança do achado: ALTA** (código estático inequívoco).

### F-05 (P1) — Índice ERC baseado em matriz ARMS hardcoded sem fonte metodológica declarada

- **Requisito afetado:** R-08 (Hendy: fórmulas de risco conceituais, exigem validação);
  seção 3.7 (não apresentar fórmula não validada como índice comprovado).
- **Arquivo/linhas:** `frontend/src/lib/risk-profile/erc.ts:3–14` (`ARMS_SEVERITY_ROW`,
  `ARMS_ERC`) e `:16–31` (`barrierLevel` conta P≠P-A, O≠O-A, A≠A-A).
- **Observado:** a severidade é atribuída por uma tabela fixa (`P-B/P-F→B`, `P-A→D`, default `C`)
  e a "barreira" pela contagem de eixos que não são o código "sem falha". O resultado é lido de
  uma matriz ARMS 4×4 hardcoded. Não há citação de fonte metodológica que sustente esses valores;
  `erc-conversion.ts` inclusive comenta "Neither scale is the ARMS Risk Index".
- **Impacto:** converte contagem de falhas em "nível de risco" sem fundamento declarado — o que a
  seção 3.7 proíbe. `inferErcLevel` (F-03) tem o mesmo problema no outro caminho.
- **Correção recomendada:** declarar a fonte/decisão formal da fórmula OU rotular como estimativa
  não validada na UI. Decisão autoral. **Confiança do achado: ALTA.**

### F-06 (P1) — Governança canônica aplicada só ao vNext; produção fora da governança

- **Requisito afetado:** Document Authority Index / Control Board (S4/S5); arquitetura esperada
  (seção 7: regras críticas não devem existir só em heurísticas soltas).
- **Arquivos:** `docs/sera-vnext/*` (governam vNext) vs. `frontend/src/lib/sera/*` (produção).
- **Observado:** todos os locks, o Control Board e o Authority Index referem-se ao motor vNext.
  O pipeline de produção (que roda por default) não é coberto por nenhum desses documentos e
  implementa metodologia divergente (F-02, F-03). O usuário final recebe o resultado legado.
- **Impacto:** a governança dá falsa sensação de controle metodológico sobre o produto real.
- **Correção recomendada:** estender a governança/estados ao pipeline de produção ou promover o
  vNext. Decisão autoral/estratégica. **Confiança do achado: ALTA.**

### F-13 (P1) — LLM na cadeia determinística de classificação sem separação clara

- **Requisito afetado:** seção 3.8 / seção 7 (IA separada de regras determinísticas; sugestão ≠
  decisão; reprodutibilidade).
- **Arquivo/linhas:** `frontend/src/lib/sera/pipeline.ts:1944–1970` (usa `step3/4/5.codigo` vindos
  do LLM como base; heurística só como fallback); `llm.ts` (providers múltiplos, `temperature=0`
  mas modelos não determinísticos).
- **Observado:** o código P/O/A de produção é primariamente a saída do LLM; a heurística
  determinística só entra quando o LLM não retorna código válido. Não há marcação de "sugestão
  até validação humana" no fluxo comum, nem validação contra schema de perguntas canônicas.
- **Impacto:** execuções equivalentes podem produzir códigos diferentes; a decisão da IA é
  apresentada como classificação, não como sugestão. **Confiança do achado: MÉDIA-ALTA**
  (comportamento do LLM não foi executado nesta fase — inferência estática do fluxo).

---

## P2 — Médios

### F-07 (P2) — Três representações de código→rótulo→eixo, com divergência potencial

- **Arquivos:** `frontend/src/lib/sera/failure-names.ts` (P-C="Falha de Conhecimento/Percepção");
  `frontend/src/lib/sera/hfacs-mapper.ts:34` (P-C "Falha de Conhecimento" → **Decision Error** do
  HFACS); `frontend/src/lib/sera-vnext/canonical-codes.ts`.
- **Observado:** P-C é código do eixo **Percepção** (Daumas Tabela 5), mas o hfacs-mapper o
  descreve e mapeia como erro de **Decisão**. Há risco de rótulo divergente entre camadas. Exige
  reconciliação código↔rótulo↔eixo (ligado a F-07 da divergência de fonte em 01-espec.).
  **Confiança: MÉDIA** (mapeamento HFACS pode ter justificativa própria; requer revisão autoral).

### F-08 (P2) — `erc_level` tratado como intervalo 1–5 sem enum canônico compartilhado

- **Arquivo/linhas:** `pipeline.ts:2035` valida `erc_level>=1 && <=5` genericamente; duas escalas
  invertidas coexistem (motor 1=crítico; HFA 5=crítico) documentadas em `erc-conversion.ts:1–20`
  (F-001 conhecido do projeto). Risco de inversão em novas telas. **Confiança: ALTA.**

### F-09 (P2) — Multifatorialidade limitada: pré-condições truncadas em 5

- **Arquivo/linhas:** `pipeline.ts:1994–1997` (`sanitizePreconditions(..., 5)`).
- **Observado:** Hendy (R-06) diz "pode haver muitas" pré-condições. O corte fixo em 5 pode
  descartar pré-condições legítimas sem sinalizar truncamento ao usuário. **Confiança: MÉDIA**
  (limite pode ser intencional de UI, mas não é sinalizado).

### F-10 (P2) — Amostra pequena / limitações nem sempre explícitas no perfil de risco

- **Arquivo/linhas:** `frontend/src/lib/sera/data-confidence.ts` existe e comunica confiança
  (bom), mas o `computeHfaErcCategoryFromCodes` do card não carrega o mesmo caveat de amostra.
- **Observado:** R-10 (4 eventos não definem perfil). O `data-confidence` mitiga parcialmente,
  porém o card de ERC/tendência pode ser lido como risco consolidado. **Confiança: MÉDIA.**

---

## P3 — Baixos

### F-11 (P3) — 22 warnings de lint (variáveis/imports não usados)

- ESLint: 0 erros, 22 warnings (ex.: `all-steps.ts` funções `runStep3Legacy`/`runStep5Legacy`
  não usadas — indício de código morto legado). Sem impacto metodológico direto. **Confiança: ALTA.**

### F-12 (P3) — Relatórios de trials com diff não commitado no working tree

- 8 arquivos `tests/sera-vnext/engine-validation-*/reports/*` aparecem modificados (regenerados).
  Não afeta metodologia, mas polui a baseline git. **Confiança: ALTA.**

### F-14 (P3) — Documentação de fronteira legado↔vNext ausente para o usuário

- Não há, na UI comum, aviso de qual motor produziu a análise (a `vnextNotice` só aparece quando
  a flag está ligada). Usuário não distingue resultado canônico de heurístico. **Confiança: MÉDIA.**
