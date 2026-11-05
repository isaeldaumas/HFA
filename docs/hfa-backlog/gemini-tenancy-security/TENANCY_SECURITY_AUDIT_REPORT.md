# HFA — Auditoria de Segurança, Tenancy e Controle de Acesso (Agente Gemini 3)

**Data de elaboração:** 05/11/2026  
**Escopo:** Mapeamento exaustivo de segurança de todas as rotas de API (`frontend/src/app/api` e `backend/app/api/routes`), isolamento multi-tenant (duas organizações sintéticas A/B), mitigação de IDOR, RBAC, confidencialidade de documentos e vetores adversariais.  
**Fronteira de propriedade:** Apenas documentação em `docs/hfa-backlog/gemini-tenancy-security/**` e suíte de testes executável em `tests/hfa-audit/gemini-tenancy-security/**`. Código de produção preservado sem alterações de runtime.

---

## 1. Sumário Executivo de Riscos

| Severidade | Quantidade | Descrição Resumida |
| :--- | :--- | :--- |
| **P0 (Crítico)** | 3 | (1) Backend FastAPI consome `user_metadata` para `tenant_id` permitindo spoofing total; (2) `applyUserAiSettingsToEnv` muta `process.env` global gerando vazamento de chaves entre tenants e condições de corrida; (3) Conflação de Admin de Tenant Enterprise com Superadmin de Plataforma expondo todos os clientes em `/api/admin/tenants` e pagamentos em `/api/admin/payments/transactions`. |
| **P1 (Alto)** | 1 | (4) `DELETE /api/events/[eventId]` insere log em `event_deletion_events` sem validar se o `eventId` pertence à organização do requisitante (poluição de auditoria cross-tenant). |
| **P2 (Médio)** | 1 | (5) Dependência total de filtragem no código da aplicação (`.eq('tenant_id', ...)`) devido ao uso ubíquo de `SUPABASE_SERVICE_ROLE_KEY` (que contorna completamente RLS no PostgreSQL). Mocks locais não provam integridade de RLS remoto. |

---

## 2. Tabela Exaustiva por Rota: Risco, Evidência, Reprodução e Remediação

### 2.1 Rotas Administrativas e de Plataforma

| Rota | Métodos | Classificação | Condição / Risco | Evidência no Código | Teste Reproduzível | Estratégia de Correção |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/admin/tenants` | `GET` | **P0 (Crítico)** | **Vazamento Global de Clientes:** Qualquer usuário com perfil `admin` cujo tenant esteja no plano `enterprise` passa no `requireAdmin` e lista **todos** os tenants, emails e usuários do sistema. | `admin.from('tenants').select('*')` e `admin.from('users').select('tenant_id, email, role')` sem filtro de tenant (`frontend/src/app/api/admin/tenants/route.ts#L18-L23`). | `VULN-03` em `test-security-vulnerabilities-reproduction.ts` | Segregar `requireAdmin` (tenant-scoped) de `requireSuperAdmin` (restrito a emails governados ou flag `is_system_admin` em tenant de sistema). |
| `/api/admin/tenants/[id]` | `PATCH` | **P0 (Crítico)** | **Sabotagem Cross-Tenant:** Admin de cliente Enterprise pode desativar (`is_active: false`) ou alterar saldo de créditos e plano de **qualquer** outra empresa. | `admin.from('tenants').update(allowed).eq('id', id)` (`admin/tenants/[id]/route.ts#L25`). | `VULN-03` em `test-security-vulnerabilities-reproduction.ts` | Proteger com `requireSuperAdmin`. |
| `/api/admin/payments/transactions` | `GET` | **P0 (Crítico)** | **Vazamento Financeiro Global:** Admin de cliente Enterprise pode listar todas as transações, IDs de pagamento Stripe e emails de compradores de todos os clientes. | `admin.from('credit_transactions').select('*')` sem `.eq('tenant_id', ...)` (`admin/payments/transactions/route.ts#L17-L21`). | `VULN-03` em `test-security-vulnerabilities-reproduction.ts` | Proteger com `requireSuperAdmin` ou filtrar por `user.tenantId`. |
| `/api/admin/stats` | `GET` | **P1 (Alto)** | **Vazamento de Métricas de Negócio:** Admin de cliente Enterprise obtém métricas globais de todos os clientes da plataforma (total de eventos, análises, faturamento). | `admin.from('tenants').select('id, plan, created_at')` (`admin/stats/route.ts#L30-L38`). | `VULN-03` em `test-security-vulnerabilities-reproduction.ts` | Restringir à governança interna ou converter em estatísticas da própria organização. |
| `/api/admin/settings/password-reset` | `POST` | **P1 (Alto)** | **Geração de Link de Recuperação:** Admin de cliente Enterprise pode disparar link de recuperação de senha de administradores de sistema. | `admin.auth.admin.generateLink({ type: 'recovery', email })` (`admin/settings/password-reset/route.ts#L29-L33`). | `test-rbac-and-auth-boundaries.ts` | Proteger com `requireSuperAdmin`. |
| `/api/admin/settings` | `GET`, `PATCH` | **P1 (Alto)** | **Exposição de Configuração de Sistema:** Permite visualizar e alterar chaves e provedores de IA globais se passar por `requireAdmin`. | `admin.from('system_settings').select('*')` (`admin/settings/route.ts#L50`). | `test-rbac-and-auth-boundaries.ts` | Proteger com `requireSuperAdmin`. |
| `/api/admin/packages`, `/api/admin/packages/[id]` | `GET`, `POST`, `PATCH`, `DELETE` | **P1 (Alto)** | **Manipulação de Pacotes de Crédito:** Admin de cliente Enterprise pode cadastrar ou alterar pacotes e preços Stripe. | `admin.from('credit_packages')` mutações globais (`admin/packages/route.ts`). | `test-rbac-and-auth-boundaries.ts` | Proteger com `requireSuperAdmin`. |
| `/api/admin/ai/test` | `POST` | **P2 (Médio)** | **Consumo Indevido de Quota:** Executa chamadas de teste de conectividade aos provedores de IA da plataforma. | `runTest(provider, key, model)` (`admin/ai/test/route.ts`). | `test-rbac-and-auth-boundaries.ts` | Rate-limiting e restrição superadmin. |
| `/api/admin/sera-shadow/comparisons` | `GET` | **Seguro** | Escopado por `user.tenantId` via `listShadowResultsForTenant(admin, user.tenantId, limit)`. | `listShadowResultsForTenant` filtra por `tenant_id` (`admin/sera-shadow/comparisons/route.ts#L32`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/admin/integrations/airtrust` | `GET`, `POST`, `DELETE` | **Seguro** | Escopado estritamente por `user.tenantId` e papel `admin` da organização. | `.eq('tenant_id', user.tenantId)` em todas as operações (`admin/integrations/airtrust/route.ts#L43, L80, L120`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/admin/sera-vnext/*` (11 rotas) | `GET`, `POST` | **Seguro (por Tenant)** | Delegam para handlers em `lib/sera-vnext-product/api-handlers.ts`, onde `context.tenantId` é propagado para o repositório. | `repository.getAnalysis(context.tenantId, id)` (`lib/sera-vnext-product/persistence/get-analysis.ts#L24`). | `test-tenancy-isolation-routes.ts` | Mantido. |

---

### 2.2 Rotas Operacionais de Eventos e Análises

| Rota | Métodos | Classificação | Condição / Risco | Evidência no Código | Teste Reproduzível | Estratégia de Correção |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/events` | `GET`, `POST` | **Seguro** | Autenticação obrigatória (`requireBearerUser`). Filtra estritamente por `user.tenantId` na listagem e força `tenant_id: user.tenantId`, `submitted_by: submittedById` na criação. | `eq('tenant_id', user.tenantId)` (`frontend/src/app/api/events/route.ts#L36, L195`). | Cenários 1–2 em `test-tenancy-isolation-routes.ts` e Cenário 1 em `test-adversarial-payloads-and-idor.ts` | Mantido. |
| `/api/events/[eventId]` | `GET` | **Seguro** | Retorna 404 para eventos de outras organizações (`.eq('tenant_id', user.tenantId)`). Previne enumeração e IDOR. | `eq('id', eventId).eq('tenant_id', user.tenantId)` (`events/[eventId]/route.ts#L26`). | Cenários 1–3 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]` | `DELETE` | **P1 (Alto)** | **Poluição de Auditoria Cross-Tenant:** Executa `writeCriticalAuditLog` e insere em `event_deletion_events` com `tenant_id: user.tenantId` e `event_id: eventId` **sem verificar** se o `eventId` pertence à organização do usuário. | Inserção sem verificação de ownership prévia (`events/[eventId]/route.ts#L107-L141`). | `VULN-04` em `test-security-vulnerabilities-reproduction.ts` | Validar `getEventDeletionRecord(admin, user.tenantId, eventId)` antes de emitir evento de auditoria com vínculo de entidade. |
| `/api/events/[eventId]/triage` | `POST` | **Seguro** | Exige papel `admin` ou `analyst` e filtra por `id` e `tenant_id`. | `eq('id', eventId).eq('tenant_id', user.tenantId)` (`events/[eventId]/triage/route.ts#L37`). | Cenário 3 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/risk` | `GET`, `POST` | **Seguro** | Valida posse do evento antes de listar ou inserir avaliações de risco. Exige `admin` ou `analyst` para POST. | `eq('tenant_id', user.tenantId).eq('event_id', eventId)` (`events/[eventId]/risk/route.ts#L32, L79`). | Cenário 4 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/duplicates` | `GET`, `POST` | **Seguro** | Valida ambos os eventos (`duplicate` e `canonical`) no `user.tenantId`. Impede vinculação cross-tenant. | `getEvent(admin, user.tenantId, eventId)` e `getEvent(admin, user.tenantId, canonicalId)` (`events/[eventId]/duplicates/route.ts#L48, L72`). | Cenário 5 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/clarifications` | `POST` | **Seguro** | Valida evento e histórico de análises SERA estritamente no `user.tenantId`. | `eq('tenant_id', user.tenantId)` (`events/[eventId]/clarifications/route.ts#L28, L38`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/reanalyze-vnext` | `POST` | **Seguro** | Valida evento no tenant e restringe reprocessamento metodológico a `admin` e `analyst`. | `eq('id', eventId).eq('tenant_id', user.tenantId)` (`events/[eventId]/reanalyze-vnext/route.ts#L34`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/sera-reviews` | `GET`, `POST` | **Seguro** | `resolveEventAnalysis` valida `eventId` e `analysisId` com `tenant_id = user.tenantId`. | `eq('tenant_id', user.tenantId)` em ambas as tabelas (`events/[eventId]/sera-reviews/route.ts#L22-L28`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/delete-request` | `POST` | **Seguro** | Exige `requireAdmin` (Enterprise Admin), valida tenant e título exato. | `getEventDeletionRecord(admin, user.tenantId, eventId)` (`events/[eventId]/delete-request/route.ts#L36`). | Cenário 6 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/deletion-impact` | `GET` | **Seguro** | Exige `requireAdmin` e calcula impacto apenas para recursos vinculados ao `user.tenantId`. | `getEventDeletionRecord(admin, user.tenantId, eventId)` (`events/[eventId]/deletion-impact/route.ts#L28`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/restore` | `POST` | **Seguro** | Exige `requireAdmin` e executa RPC com `p_tenant_id: user.tenantId`. | `restoreSoftDeletedEvent({ tenantId: user.tenantId, ... })` (`events/[eventId]/restore/route.ts#L29`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/events/[eventId]/purge` | `POST` | **Seguro** | Exige `requireAdmin` e gates sintéticos rígidos (`SYNTHETIC_EVENT_PREFIX`). | `purgeSoftDeletedEvent` valida `tenantId` e gates sintéticos (`events/[eventId]/purge/route.ts#L29`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]` | `GET` | **Seguro** | Filtra por `id` e `tenant_id`. Retorna 404 para IDOR. | `eq('id', analysisId).eq('tenant_id', user.tenantId)` (`analyses/[analysisId]/route.ts#L24`). | Cenário 7 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]/flows` | `GET` | **Seguro** | Filtra por `id` e `tenant_id`. | `eq('id', analysisId).eq('tenant_id', user.tenantId)` (`analyses/[analysisId]/flows/route.ts#L36`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]/pdf` | `GET` | **Seguro** | Filtra por `id` e `tenant_id`. Bloqueia análises parciais com 422. | `eq('id', analysisId).eq('tenant_id', user.tenantId)` (`analyses/[analysisId]/pdf/route.ts#L21`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/sera/analyses/[analysisId]/pdf` | `GET` | **Seguro** | `exportSeraVNextAnalysisPdf` propaga `context.tenantId`. | `getSeraVNextAnalysisDetail({ context: { tenantId } })` (`sera/analyses/[analysisId]/pdf/route.ts#L20`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]/edits` | `GET` | **Seguro** | Filtra por `analysis_id` e `tenant_id`. | `eq('analysis_id', analysisId).eq('tenant_id', user.tenantId)` (`analyses/[analysisId]/edits/route.ts#L20`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]/edits/[editId]` | `DELETE` | **Seguro** | Retorna 410 Gone (motor histórico somente leitura). | `status: 410` (`analyses/[analysisId]/edits/[editId]/route.ts#L10`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/analyses/[analysisId]/recalculate` | `POST` | **Seguro** | Retorna 410 Gone (desativado). | `status: 410` (`analyses/[analysisId]/recalculate/route.ts#L10`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/recalculate` | `POST` | **Seguro** | Retorna 410 Gone (desativado). | `status: 410` (`recalculate/route.ts#L10`). | `test-tenancy-isolation-routes.ts` | Mantido. |

---

### 2.3 Rotas de Ações Corretivas, Perfil de Risco e Segurança

| Rota | Métodos | Classificação | Condição / Risco | Evidência no Código | Teste Reproduzível | Estratégia de Correção |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/actions` | `GET` | **Seguro** | Filtra por `eq('tenant_id', user.tenantId)`. Valida que `requestedEventId` pertence à mesma organização antes de filtrar. | `candidateEventIds` filtrado em `events` com `tenant_id` (`actions/route.ts#L59`). | Cenário 8 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/actions` | `POST` | **Seguro** | Exige `admin` ou `analyst`. Valida se `source_event_id` pertence ao `user.tenantId`. | `eq('tenant_id', user.tenantId)` na validação do evento (`actions/route.ts#L137`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/actions/[id]` | `PATCH` | **Seguro** | Exige `admin` ou `analyst`. Filtra por `id` e `tenant_id`. Valida se `owner_user_id` pertence à organização e está ativo. | `eq('id', id).eq('tenant_id', user.tenantId)` e validação de `owner` (`actions/[id]/route.ts#L45, L93`). | Cenário 2 em `test-adversarial-payloads-and-idor.ts` | Mantido. |
| `/api/actions/suggestions` | `GET` | **Seguro** | Filtra por `user.tenantId` na análise de origem. | `eq('tenant_id', user.tenantId)` (`actions/suggestions/route.ts#L29`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/risk-profile` | `GET` | **Seguro** | `getRiskProfileSummaryForTenant` filtra todos os eventos e exclusões estritamente por `user.tenantId`. | `getRiskProfileSummaryForTenant(user.tenantId, admin)` (`risk-profile/route.ts#L36`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/risk-profile/exclusions` | `POST` | **Seguro** | Exige `requireAdmin`. Valida se a fonte pertence ao universo canônico do tenant antes de excluir. | `eligibleSource` verificado contra lista de eventos do tenant (`risk-profile/exclusions/route.ts#L45`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/risk-profile/exclusions/[exclusionId]` | `DELETE` | **Seguro** | Exige `requireAdmin` e filtra exclusão por `tenant_id = user.tenantId`. | `eq('id', exclusionId).eq('tenant_id', user.tenantId)` (`risk-profile/exclusions/[exclusionId]/route.ts#L28`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/safety/overview` | `GET` | **Seguro** | Carrega eventos, riscos e ações estritamente do `user.tenantId` (limite `MAX_ROWS = 5000`). | `.eq('tenant_id', user.tenantId)` em todas as 4 queries paralelas (`safety/overview/route.ts#L43-L64`). | `test-tenancy-isolation-routes.ts` | Mantido. |

---

### 2.4 Rotas de Integração, Auth, Documentos e IA

| Rota | Métodos | Classificação | Condição / Risco | Evidência no Código | Teste Reproduzível | Estratégia de Correção |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/integrations/airtrust/events` | `POST`, `GET` | **Seguro** | Autentica via token hash em `integration_connections`. Valida obrigatoriamente se `external_tenant_ref === connection.external_tenant_ref` (403 se divergir). Escopa eventos a `connection.tenant_id`. | Verificação explícita de `externalTenantRef` (`integrations/airtrust/events/route.ts#L54, L87`). | Cenário 9 em `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/extract-document` | `POST` | **Seguro** | Autenticação via `requireBearerUser`. Não persiste em banco de documentos, valida tamanho, extensão e magic bytes (%PDF / PK..). | Validação rigorosa em `detectDocumentKind` e rate limiting por hora (`extract-document/route.ts#L45-L68`). | Cenários 3–6 em `test-adversarial-payloads-and-idor.ts` | Mantido. |
| `/api/extract-pdf` | `POST` | **Informativo** | Retorna 501 Not Implemented (placeholder de arquitetura). | Retorno 501 (`extract-pdf/route.ts#L17`). | N/A | Implementar com auth Bearer quando ativado. |
| `/api/auth/me` | `GET` | **Seguro** | Resolve tenant/role via `requireBearerUser` e retorna dados da própria organização. | `admin.from('tenants').select(...).eq('id', user.tenantId)` (`auth/me/route.ts#L19`). | `test-rbac-and-auth-boundaries.ts` | Mantido. |
| `/api/auth/register` | `POST` | **Seguro** | Delega para `handleRegisterRequest`, que cria novo tenant isolado para o usuário cadastrado. | `handleRegisterRequest` (`auth/register/route.ts#L4`). | `test-rbac-and-auth-boundaries.ts` | Mantido. |
| `/api/auth/oauth/bootstrap` | `POST` | **Seguro** | Autentica JWT, verifica se já existe em `public.users` via `resolveAuthorizedUserContext` ou provisiona novo tenant individual. | `resolveAuthorizedUserContext` (`auth/oauth/bootstrap/route.ts#L112`). | `test-rbac-and-auth-boundaries.ts` | Mantido. |
| `/api/credits` | `GET` | **Seguro** | Filtra saldo do tenant e transações por `eq('tenant_id', user.tenantId)`. | `.eq('tenant_id', user.tenantId)` (`credits/route.ts#L30`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/trial/status` | `GET` | **Seguro** | Oculta para administradores/enterprise (204 No Content). Filtra contagem de eventos por `eq('tenant_id', user.tenantId)`. | `.eq('tenant_id', user.tenantId)` (`trial/status/route.ts#L33`). | `test-tenancy-isolation-routes.ts` | Mantido. |
| `/api/settings/ai` | `GET`, `POST` | **Seguro (por usuário)** | Configurações persistidas por `user_id` em `ai_settings`. Chaves encriptadas no banco. | `eq('user_id', user.userId)` (`settings/ai/route.ts#L36, L107`). | `test-rbac-and-auth-boundaries.ts` | Mantido. |
| `/api/settings/ai/test` | `POST` | **Seguro** | Testa conectividade com chave do próprio usuário autenticado. | `eq('user_id', user.userId)` (`settings/ai/test/route.ts#L29`). | `test-rbac-and-auth-boundaries.ts` | Mantido. |
| `applyUserAiSettingsToEnv` (lib) | N/A | **P0 (Crítico)** | **Poluição de Processo e Vazamento Cross-Tenant:** Desencripta chave do usuário e grava em `process.env.OPENAI_API_KEY`, etc. Como `process.env` é global no processo Node.js, requisições concorrentes de outros tenants herdam as chaves de terceiros! | `process.env[API_KEY_ENV_KEYS[provider]] = decrypted` (`frontend/src/lib/server/apply-user-ai-settings-to-env.ts#L69-L78`). | `VULN-02` em `test-security-vulnerabilities-reproduction.ts` | Injetar chaves por contexto de execução / instância de cliente LLM, **nunca** mutar `process.env` em runtime. |

---

### 2.5 Backend Python FastAPI (`backend/app/api/routes`)

| Rota | Métodos | Classificação | Condição / Risco | Evidência no Código | Teste Reproduzível | Estratégia de Correção |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `backend/events.py` | `GET /`, `POST /`, `GET /{id}` | **P0 (Crítico)** | **Tenant Spoofing Total / Bypass de Tenancy:** Obtém `tenant_id` diretamente de `user.user.user_metadata.get("tenant_id")`. Qualquer usuário autenticado no Supabase pode atualizar seus próprios metadados e acessar/criar eventos em qualquer organização do banco! | `tenant_id = user.user.user_metadata.get("tenant_id")` (`backend/app/api/routes/events.py#L23, L35, L115`). | `VULN-01` em `test-security-vulnerabilities-reproduction.ts` | Desativar backend legado ou portar o resolvedor autoritativo `resolveAuthorizedUserContext` (consultando `public.users`). |
| `backend/analyses.py` | Todas as rotas | **P0 (Crítico)** | Mesma vulnerabilidade de consumo de `user_metadata.get("tenant_id")`. | `tenant_id = user.user.user_metadata.get("tenant_id")` (`backend/app/api/routes/analyses.py#L24, L36, L72, L87, L128, L202, L220`). | `VULN-01` em `test-security-vulnerabilities-reproduction.ts` | Mesma recomendação acima. |
| `backend/actions.py` | Todas as rotas | **P0 (Crítico)** | Mesma vulnerabilidade de consumo de `user_metadata.get("tenant_id")`. | `tenant_id = user.user.user_metadata.get("tenant_id")` (`backend/app/api/routes/actions.py#L19, L31`). | `VULN-01` em `test-security-vulnerabilities-reproduction.ts` | Mesma recomendação acima. |
| `backend/credits.py` | Todas as rotas | **P0 (Crítico)** | Mesma vulnerabilidade de consumo de `user_metadata.get("tenant_id")`. | `tenant_id = user.user.user_metadata.get("tenant_id")` (`backend/app/api/routes/credits.py#L29`). | `VULN-01` em `test-security-vulnerabilities-reproduction.ts` | Mesma recomendação acima. |

---

## 3. Análise Detalhada dos Achados de Alta Severidade

### 3.1 VULN-01 (P0): Backend Python Consome `user_metadata`
- **Impacto:** Quebra total do isolamento multi-tenant se o backend Python estiver publicado (ex.: Render conforme `render.yaml`).
- **Causa Raiz:** O backend FastAPI não implementou a resolução autoritativa via banco de dados (`public.users`) que o frontend Next.js adotou na migração `20260910193000`. Ele confia em `user.user.user_metadata`, que é um dicionário editável pelo próprio cliente no Supabase Auth.
- **Evidência de Teste:** Teste `REPRODUCTION VULN-01 [P0]` executado com sucesso em `test-security-vulnerabilities-reproduction.ts`.

### 3.2 VULN-02 (P0): Mutação Global de `process.env` em `applyUserAiSettingsToEnv`
- **Impacto:** Vazamento de credenciais privadas de provedores de IA (OpenAI, Anthropic, DeepSeek, Google, Groq) entre clientes concorrentes; cobrança cruzada e condições de corrida.
- **Causa Raiz:** Para cada requisição de análise, a função lê as chaves do usuário e as atribui diretamente a variáveis globais de processo: `process.env.OPENAI_API_KEY = decrypted`. Em um servidor Node.js que atende múltiplas requisições simultâneas ou reaproveita o processo serverless, a chave do Usuário A permanece acessível e é usada pelas requisições do Usuário B.
- **Evidência de Teste:** Teste `REPRODUCTION VULN-02 [P0]` executado com sucesso em `test-security-vulnerabilities-reproduction.ts`.

### 3.3 VULN-03 (P0): Conflação de Admin de Tenant com Superadmin
- **Impacto:** Violação de privacidade e sigilo comercial; risco de destruição de dados ou bloqueio de organizações rivais.
- **Causa Raiz:** A função `requireAdmin` em `frontend/src/lib/server/admin-auth.ts` valida apenas se a organização está no plano `enterprise` e se o usuário tem a role `admin`. Qualquer cliente que contrate o plano Enterprise torna-se um "admin", obtendo permissão para acessar `/api/admin/tenants` (lista todos os clientes da plataforma), `/api/admin/tenants/[id]` (modifica e suspende qualquer cliente), e `/api/admin/payments/transactions` (visualiza todas as transações de pagamento da plataforma).
- **Evidência de Teste:** Teste `REPRODUCTION VULN-03 [P0]` executado com sucesso em `test-security-vulnerabilities-reproduction.ts`.

### 3.4 VULN-04 (P1): `DELETE /api/events/[eventId]` Sem Validação de Posse de Evento
- **Impacto:** Poluição cruzada na tabela `event_deletion_events` e no log de auditoria crítica.
- **Causa Raiz:** Na rota `DELETE /api/events/[eventId]`, o manipulador grava um evento de recusa de exclusão física (`HARD_DELETE_DENIED`) relacionando `tenant_id: user.tenantId` com o `eventId` recebido na URL, **antes** de verificar se aquele `eventId` existe e se pertence à organização do requisitante.
- **Evidência de Teste:** Teste `REPRODUCTION VULN-04 [P1]` executado com sucesso em `test-security-vulnerabilities-reproduction.ts`.

---

## 4. Auditoria de Defesa contra Enumeração e Resposta de Erro

- **Consistência 401 x 403 x 404:**  
  - Requisição sem Bearer token: **401** `Não autorizado`  
  - Requisição com papel insuficiente (ex: Viewer tentando triar): **403** `Permissão insuficiente...`  
  - Requisição para recurso de outra organização: **404** `Evento não encontrado` / `Análise não encontrada`  
  - Requisição para UUID inexistente: **404** `Evento não encontrado`
- **Mitigação de Enumeração de UUIDs:**  
  O comportamento das rotas de eventos, análises e ações é rigorosamente uniforme: consultar um ID inexistente ou um ID pertencente a outro tenant retorna exatamente o mesmo status (404) e a mesma mensagem de erro. Um atacante externo não consegue inferir a existência de recursos em tenants vizinhos via código de status ou payload.

---

## 5. Alerta Metodológico: RLS vs Service Role

Todas as rotas Next.js autenticadas usam `getSupabaseAdmin()`, que inicializa o cliente com `SUPABASE_SERVICE_ROLE_KEY`. Por definição arquitetural do Supabase e PostgreSQL, conexões com service role **ignoram completamente** as políticas RLS configuradas no banco de dados.  
Portanto:
1. O isolamento de tenancy no HFA depende **100% dos filtros na camada de aplicação** (`.eq('tenant_id', user.tenantId)`).
2. Testes com mocks em memória provam a lógica da aplicação, mas **não substituem** a validação de políticas RLS para clientes de acesso direto (anon/authenticated).
3. Qualquer consulta no código do servidor que esqueça o filtro `.eq('tenant_id', ...)` resultará em vazamento silencioso cross-tenant.
