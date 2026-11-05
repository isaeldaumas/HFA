# Inventário de Checks CI, Gates e Modos de Falha Conhecidos (2026-11-05)

**Executor:** AGENTE GEMINI 4  
**Worktree:** `/private/tmp/hfa-gemini-release-qa-20261105`  
**Branch:** `gemini/hfa-release-qa-20261105`  

---

## 1. Visão Geral dos Três Workflows de CI

O repositório `isaeldaumas/HFA` possui três workflows de automação no GitHub Actions:

| Workflow | Arquivo | Gatilhos | Propósito | Execução Automática | Acesso Externo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HFA Core CI** | `hfa-core-ci.yml` | `pull_request` (main), `push` (main), `workflow_dispatch` | Gates de segurança, tipos, lint, build e contratos essenciais | SIM | NÃO (placeholders apenas) |
| **SERA vNext Deterministic** | `hfa-sera-vnext-deterministic-regression.yml` | `pull_request` (main), `push` (main), `workflow_dispatch` | Regressão de 196 casos determinísticos do motor SERA | SIM | NÃO (placeholders apenas) |
| **HFA Integrated Regression** | `hfa-integrated-regression.yml` | `workflow_dispatch` (exclusivo) | Testes integrados contra staging controlado | NÃO (manual apenas) | SIM (staging controlado) |

---

## 2. Inventário Detalhado dos Gates do HFA Core CI (20 Steps)

Todos os 20 passos abaixo são executados sequencialmente em `ubuntu-latest` com Node 22 e variáveis placeholder:

1. **Production dependency vulnerability gate (`npm audit --omit=dev --audit-level=high`)**:
   - Bloqueia vulnerabilidades de severidade alta/crítica em pacotes de produção.
2. **Development tooling vulnerability gate (`npm audit --audit-level=moderate`)**:
   - Bloqueia vulnerabilidades moderadas em ferramentas de dev.
3. **Signup WAF 429 UI contract (`tests/api-rate-limit-response.test.ts`)**:
   - Garante que respostas 429 com HTML ou JSON retornam feedback amigável e seguro sem vazar detalhes técnicos.
4. **Supabase direct signup policy audit contract (`tests/auth-public-signup-policy.test.mjs`)**:
   - Garante que o cadastro direto de usuário não contorne políticas de convite/email e audita parâmetros do provedor de auth.
5. **Two-tenant read-only E2E fixture contract (`tests/two-tenant-readonly-e2e.test.mjs`)**:
   - Valida que duas identidades sintéticas só leem seus próprios dados e falham fechado contra cross-tenant ou anônimo.
6. **TypeScript (`npx tsc --noEmit`)**:
   - Typecheck completo do frontend.
7. **Lint (`npm run lint`)**:
   - ESLint 9 com regras do Next.js.
8. **Build (`npm run build`)**:
   - Prebuild guard (`tools/prebuild-shadow-production-guard.mjs`) seguido de `next build` (Next.js 16.4.5 Turbopack).
9. **Registration consistency and cleanup (`frontend/tests/register-compensating-rollback.test.ts`)**:
   - 20 cenários de compensação e rollback em caso de falha de cadastro (usuário público vs auth vs tenant).
10. **ERC containment runtime (`tests/hfa-audit/erc-containment/erc-containment-trial-001.ts`)**:
    - Verifica isolamento dos dois mecanismos ERC ativos conhecidos (`MOTOR_HEURISTIC_V1` e `ARMS_CODE_MATRIX_V1`).
11. **ERC containment static (`tests/hfa-audit/erc-containment/erc-containment-trial-002-static.ts`)**:
    - Análise estática que impede uso indevido de funções legadas de ERC fora de seus módulos isolados.
12. **ERC containment D3-b (`tests/hfa-audit/erc-containment/erc-containment-trial-003-d3b.ts`)**:
    - Garante que a ausência deliberada de ERC em vNext não rebaixe artificialmente o nível de confiança.
13. **Legacy freeze (`tests/hfa-audit/legacy-freeze/legacy-freeze-trial-001.ts`)**:
    - Tripwire estático que congela matriz ARMS (16 entradas) e códigos canônicos (8 P, 4 O, 10 A).
14. **Shadow mode (`tests/hfa-audit/shadow-mode/shadow-mode-trial-001.ts`)**:
    - Garante que todas as flags de execução, persistência e visualização do Shadow Mode estejam desabilitadas por padrão.
15. **Shadow divergence V1 contract (`tests/hfa-audit/shadow-mode/shadow-mode-trial-002-comparison.ts`)**:
    - Contrato de comparação exata sem alegações semânticas.
16. **Shadow rollback contract (`tests/hfa-audit/shadow-mode/shadow-mode-trial-003-rollback.ts`)**:
    - Garante que o procedimento de rollback do Shadow mode é fail-closed.
17. **Shadow production build interlock adversarial (`tests/shadow-prod-prebuild-guard.test.mjs`)**:
    - 12 testes adversariais provando que qualquer flag Shadow ativada aborta o build de produção imediatamente.
18. **Tenant isolation contract (`tests/hfa-audit/tenant-isolation/tenant-isolation-contract-trial-001.ts`)**:
    - 12 cenários de auditoria estática contra IDOR e vazamento cross-tenant em todas as 63 rotas de API.
19. **Commercial trial contract (`tests/product/test-trial-usage.ts`)**:
    - Regras de contagem de créditos, limites de plano e expiração de trials.
20. **Safety event workflow contract (`tests/product/test-safety-event-workflow.ts`)**:
    - Validação de regras de negócio para fluxo de eventos de segurança.

---

## 3. Inventário do Gate SERA vNext (`scripts/run-sera-vnext-ci-regression.ts`)

- **Total de casos no manifesto:** 251 casos.
- **Selecionados (determinísticos atuais):** 198 casos.
- **Casos executados:** 196 casos.
- **Resultados:** 194 PASS, 2 NOT_READY (esperado por falta de dados reais/holding), 0 FAIL, 0 timeouts.
- **Exclusões de CI Documentadas:**
  1. `tests/sera-vnext/typecheck-closure-runtime-gate-a4r217max-trial-001.ts`: Depende de artefatos locais compilados.
  2. `tests/sera-vnext/product-unification/risk-profile-real-trial-001.ts`: Depende de conexão com banco de dados real.

---

## 4. Modos de Falha e Pontos de Atenção Críticos

### Ponto de Falha 1: Prerender do Next.js sem Variáveis de Ambiente
- **Causa:** `src/lib/supabase.ts` executa em nível de módulo:
  ```typescript
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  export const supabase = createClient(supabaseUrl, supabaseAnonKey)
  ```
- **Impacto:** Durante o `next build`, páginas que importam o cliente Supabase executam avaliação estática. Se `NEXT_PUBLIC_SUPABASE_URL` não estiver definida, o build falha com `Error: supabaseUrl is required`.
- **Mitigação:** CI injeta placeholders (`https://example.supabase.co`). Builds locais requerem arquivo `.env.local` ou variáveis no comando.

### Ponto de Falha 2: Expiração do Snapshot de Migrações (> 24 Horas)
- **Causa:** `scripts/release/preflight-migration-history.mjs` impõe `maxAgeHours = 24` sobre `docs/release/migration-ledger-snapshot-20261103.json`.
- **Estado Atual:** O snapshot tem idade superior a 42 horas, gerando **FAIL**:
  `"problems": ["Supabase snapshot stale or timestamp invalid; reacquire migration ledger read-only"]`.
- **Impacto:** Qualquer tentativa de release ou push de migrações é travada (`db_push_allowed: false`).

### Ponto de Falha 3: Divergência entre Migrações Locais (47) e Remotas (51)
- **Causa:** Existem 51 migrações no ledger remoto do Supabase e 47 arquivos locais em `supabase/migrations/`.
- **Tratamento:** O snapshot classifica 36 versões exatas, 10 pares com equivalência léxica auditada, 1 histórico com trava de reaplicação e 5 versões remotas adicionais.
- **Impacto:** `db_push` é estritamente proibido sem reconciliação manual documentada.

---

## 5. Script de Verificação Automatizada

Script correspondente:
`tests/hfa-audit/gemini-release-readiness/verify-ci-gates-inventory.ts`

Comando de teste:
```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/verify-ci-gates-inventory.ts
```
Resultado: **PASS (100% dos checks validados)**.
