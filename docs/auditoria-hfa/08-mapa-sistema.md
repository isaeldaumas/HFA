# Mapa do Sistema (Arquitetura Identificada)

Fluxo real quando um usuário submete uma análise, com os arquivos/serviços/tabelas de cada etapa.
`⚠` marca etapas com achado relevante.

```
[ENTRADA] narrativa/PDF/DOCX
   └─ UI: app/(dashboard)/... → POST /api/analyze
        api/analyze/route.ts  (auth: requireBearerUser → api-auth.ts)
        └─ requireBearerUser: tenant_id via user_metadata (fallback tabela users) ⚠F-01
   │
   ├─ FLAG isSeraVNextCanonicalAnalyzeEnabled()  (feature-flags.ts)
   │     ├─ TRUE  → createSeraVNextAnalysis (sera-vnext-product/persistence)
   │     │           motor CANÔNICO: escape-point → canonical-tree → UNRESOLVED  (candidate-only)
   │     └─ FALSE (default) → completeSeraAnalysisAfterEventCreated  ⚠F-02/F-06
   │
[APROFUNDAMENTO]  (SERA parcial; MDC não modelado como técnica distinta) ⚠R-09
   │
[EVIDÊNCIAS] step2 escape point: pipeline.ts:700 (safe_operation_escape_point)
   │
[ANÁLISE / CLASSIFICAÇÃO]  runSeraPipeline (pipeline.ts:1936)
   ├─ step1..step2  (LLM: llm.ts, provider por tenant, temp=0)
   ├─ step3/4/5 em paralelo → códigos P/O/A vêm do LLM ⚠F-13
   ├─ fallback heurístico: inferPerceptionCode/Objective/Action (substring PT) ⚠F-02
   │     └─ sem evidência ⇒ P-A / O-A / A-A  (nunca UNRESOLVED) ⚠F-03
   ├─ inferErcLevel (keyword → 1..5) ⚠F-05
   └─ selectDeterministicPreconditions → sanitizePreconditions(…, 5) ⚠F-09
   │
[VALIDAÇÃO] computeCompleteness (pipeline.ts:2025) — quase sempre "complete" ⚠F-03
   │
[ARMAZENAMENTO]  buildAnalysisUpsertPayload → admin.upsert('analyses')
        (service_role bypassa RLS; filtro tenant_id na aplicação) ⚠F-01
        tabelas: events, analyses, audit_log, analysis_edits
        storage: bucket analysis-documents
   │
[RISCO]  perfil: GET /api/risk-profile → risk-profile/server.ts
        ├─ card ERC: computeHfaErcCategoryFromCodes (matriz ARMS dos códigos) ⚠F-04/F-05
        ├─ trend:    risk-quality-trend.ts → coerceMotorErcToHfaCategory(erc_level) ⚠F-04
        └─ data-confidence.ts (caveat de amostra) ✓ parcial ⚠F-10
   │
[RECOMENDAÇÕES / HFACS]  hfacs-mapper.ts (código SERA → HFACS) ⚠F-07
        safety-issue-candidates.ts
   │
[RELATÓRIOS]  pdf-report.ts ; flow-renderer.ts
   │
[INDICADORES]  dashboard/page.tsx (agrega analyses) — reconciliação ⚠F-04
```

## Tabelas principais (Supabase)

- `tenants` (plan, credits_balance), `users` (espelho público, tenant_id, role)
- `events` (tenant_id, raw_input, status, deleted_at)
- `analyses` (perception_code, objective_code, action_code, erc_level, preconditions,
  analysis_completeness, motor_version, source_file_url, …)
- `sera_vnext_*` (produto beta: *_candidate_code, review_status, engine_output, warnings, …)
- `audit_log`, `analysis_edits`, `risk_profile_exclusions`

## Camadas de autorização

- `requireBearerUser` (api-auth.ts) — verifica Bearer JWT, resolve tenant_id/role.
- Rotas usam **service_role** (`getSupabaseAdmin`) + filtro `.eq('tenant_id', user.tenantId)`.
- RLS (`get_tenant_id`) presente mas **inoperante** (F-01) — não é a camada de enforcement.
- Cliente browser (`lib/supabase.ts`) só faz `auth.getSession()`; nenhuma leitura de dados
  direta com anon key encontrada.
