# Plano Reproduzível de Smoke Test em Staging com Dados Sintéticos (2026-11-05)

**Executor:** AGENTE GEMINI 4  
**Worktree:** `/private/tmp/hfa-gemini-release-qa-20261105`  
**Branch:** `gemini/hfa-release-qa-20261105`  

---

## 1. Princípios e Regras Invioláveis do Teste

1. **PROIBIÇÃO DE PRODUÇÃO:**
   - O host `systemhfa.vercel.app` (e quaisquer aliases associados) é **estritamente proibido** como alvo de testes.
   - Qualquer tentativa de execução de testes automatizados ou scripts de smoke contra domínios de produção deve falhar imediatamente.
2. **DADOS ESTREITAMENTE SINTÉTICOS:**
   - Nenhum CPF, e-mail real, dados de pilotos, aeronaves de companhias em operação ou tokens pessoais podem ser usados.
   - Usar exclusivamente as fixtures pré-declaradas nos repositórios:
     - Tenant A: `489d4eca-0e89-4adf-80ba-6a16c74d3201`
     - Tenant B: `b5ecab49-2d1b-43bf-80aa-88f58b738910`
3. **NENHUMA CHAMADA PRIVILEGIADA:**
   - Não utilizar `SUPABASE_SERVICE_ROLE_KEY` para contornar autenticação durante os testes de smoke.
   - Os testes simulam sessões de usuários reais através de tokens JWT emitidos no contexto restrito de teste.

---

## 2. Separação Estrita: Executado vs Proposto

### 2.1 O Que Foi Efetivamente Executado Nesta Rodada (Auditoria Local)
- [x] **Auditoria de Guardrails de Staging:** Verificação de que o workflow `HFA Integrated Regression` não roda automaticamente e exige confirmação manual `confirm_staging_only: true`.
- [x] **Verificação de Isolamento Estático de Rotas:** Confirmação de que todas as rotas protegidas (`/api/auth/me`, `/api/events`, `/api/admin/tenants`) rejeitam requisições sem credenciais com status 401 ou 403.
- [x] **Contrato de Formato Sintético:** Validação de formato e não-colisão dos identificadores UUID v4 para organizações A e B.
- [x] **Build e Prerender Guard:** Confirmação de que as 72 páginas estáticas compilam sem expor flags do Shadow Mode.

### 2.2 O Que É Proposto para Execução em Staging Remoto (Dependente de Autorização Humana)
Quando o ambiente de staging for aprovisionado ou ativado via `workflow_dispatch`, o operador humano deverá seguir a seguinte matriz de testes:

| Fase | Alvo / Rota | Ação / Payload Sintético | Status Esperado | Critério de Sucesso |
| :--- | :--- | :--- | :--- | :--- |
| **Fase 1: Pública** | `GET /` | Requisição sem auth | `200 OK` | Renderiza landing page sem erros no console |
| **Fase 1: Pública** | `GET /login` | Requisição sem auth | `200 OK` | Formulário de login exibido com segurança |
| **Fase 1: Pública** | `GET /methodology` | Requisição sem auth | `200 OK` | Página científica renderizada |
| **Fase 2: Fail-Closed**| `GET /api/auth/me` | Requisição anônima | `401 Unauthorized` | Resposta limpa sem vazamento de stacktrace |
| **Fase 2: Fail-Closed**| `GET /api/events` | Requisição anônima | `401 Unauthorized` | Nenhum evento listado |
| **Fase 2: Fail-Closed**| `GET /api/admin/tenants` | Requisição anônima | `401 / 403` | Recusa acesso a dados administrativos |
| **Fase 3: Autenticado A** | `GET /api/events` | Token Tenant A | `200 OK` | Apenas eventos associados ao Tenant A são visíveis |
| **Fase 4: Cross-Tenant**| `GET /api/events/{EVENT_B_ID}` | Token Tenant A tentando ler evento do Tenant B | `404 Not Found` (ou `403`) | Isolamento estrito entre organizações |
| **Fase 5: Ingestão** | `POST /api/events` | Payload sintético de evento (sem dados reais) | `200/201 OK` | Persistência associada ao tenant da sessão |
| **Fase 6: Purge** | `POST /api/events/{ID}/purge` | Limpeza de evento sintético | `200 OK` | Exclusão controlada de fixture |

---

## 3. Procedimento Operacional de Execução Remota

1. **Acessar GitHub Actions:** Ir para `isaeldaumas/HFA` → Actions → Workflow `HFA Integrated Regression`.
2. **Disparo Manual (workflow_dispatch):**
   - Marcar obrigatoriamente: `confirm_staging_only = true`.
   - Selecionar nível de execução: `READ_ONLY` (recomendado para primeira validação) ou `MUTATING_SYNTHETIC` (apenas se fixtures estiverem limpas).
3. **Verificação de Log:**
   - Conferir se o step `check-environment` valida que o project ref corresponde ao projeto de staging (não produção).
   - Verificar ausência de flags Shadow (`SERA_SHADOW_*=false`).
   - Conferir se o status final é `PASS`.

---

## 4. Script de Verificação Local do Contrato

Script correspondente:
`tests/hfa-audit/gemini-release-readiness/staging-smoke-synthetic-plan.ts`

Comando de teste:
```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/staging-smoke-synthetic-plan.ts
```
Resultado: **PASS (12 checks executados com sucesso, 4 etapas propostas documentadas)**.
