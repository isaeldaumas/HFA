# F-01 — Investigação Especial de Isolamento entre Tenants

Tratado como potencial P0 de segurança até conclusão. **Conclusão: exposição cross-tenant
REFUTADA; RLS-como-defesa-em-profundidade confirmada inoperante (fail-closed). Severidade P2.**

## Matriz de superfícies

| Superfície | Credencial | RLS aplicada? | Filtro de tenant aplicado? | Teste de isolamento | Resultado |
|---|---|---|---|---|---|
| `POST /api/analyze` | service_role | Não (bypass) | Sim — `user.tenantId` (JWT) em events/analyses | #6,#7,#8 | Isolado |
| `GET /api/analyses/[id]` | service_role | Não | Sim — `.eq('tenant_id', user.tenantId)` | #1,#6 | Isolado |
| `PATCH/DELETE /api/events/[id]` | service_role | Não | Sim — RPC `security definer` `and tenant_id=p_tenant_id` | #2,#3 | Isolado |
| `GET /api/risk-profile`, `org/*` | service_role | Não | Sim — `getRiskProfileSummaryForTenant(tenantId)` filtra em todas as queries | #1,#5 | Isolado |
| vNext `admin/sera-vnext/analyses/[id]/*` | service_role | Não | Sim — `repository.getAnalysis(tenantId,id)` `.eq('tenant_id',…)` + `requireAdmin` | #1,#6 | Isolado |
| Export vNext (`/export`) | service_role | Não | Sim — mesmo repositório tenant-scoped | #5 | Isolado |
| Storage `analysis-documents` | service_role | n/a (bucket privado) | Path `${userId}/${analysisId}/…`; acesso só via admin | #4 | Isolado |
| Deleção/purge/restore | service_role | Trigger usa `get_tenant_id()` (inerte) + RPC SQL tenant | #2,#3 | Isolado (via RPC) |
| Leitura direta client (anon key) | anon | **Sim** (mas `get_tenant_id()`=NULL ⇒ nega tudo) | n/a | #6,#10 | Fail-closed (sem dados) |
| Rota sem `tenantId` | — | — | `requireBearerUser` lança 403 "tenant_id ausente" | #7,#10 | Bloqueado (403) |

## Testes negativos (2 tenants A e B) — resultado esperado por construção do código

> Reprodução **lógica/estática** (não houve Supabase real autorizado nesta etapa). Cada linha
> aponta o mecanismo que bloqueia a tentativa.

| # | Tentativa (A → B) | Mecanismo de bloqueio | Resultado |
|---|---|---|---|
| 1 | A consulta registro de B | filtro `.eq('tenant_id', A)` em todas as queries | 0 linhas / 404 |
| 2 | A altera registro de B | RPC `and tenant_id=p_tenant_id` (p_tenant_id=A) | no-op / erro |
| 3 | A exclui registro de B | idem #2 | no-op / erro |
| 4 | A acessa arquivo de B | storage só via service_role; path por `userId` de A | sem acesso |
| 5 | A exporta dados de B | export usa `getAnalysis(A, id)` tenant-scoped | 404 |
| 6 | A acessa registro de B por ID conhecido | fetch por id inclui `.eq('tenant_id', A)` | 404 |
| 7 | Rota sem `tenantId` | `requireBearerUser` → 403 | bloqueado |
| 8 | `tenantId` manipulado pelo cliente | nenhuma rota lê tenant do corpo/query | ignorado |
| 9 | Relação indireta (action→analysis de B) | `corrective_actions.tenant_id=A` nas queries/RPC | isolado |
| 10 | Usuário sem claim de tenant | 403 "tenant_id ausente no perfil" (`api-auth.ts:80`) | bloqueado |

**Nenhuma tentativa cruzada funciona.** Portanto F-01 **não** é P0 de segurança.

## Natureza do achado remanescente (P2)

- **[FATO]** a RLS não é a camada de enforcement e está inerte (fail-closed).
- **[RISCO]** defesa em profundidade ausente: se uma futura rota service_role esquecer o filtro
  `tenant_id`, ou se alguém adicionar leitura client-side com anon key **e** habilitar o hook de
  claims incorretamente, o backstop de RLS não existe hoje.
- **Recomendação (não aplicada):** ou tornar a RLS funcional (hook `custom_access_token` que
  promove `tenant_id`/`app_metadata`, ou reescrever `get_tenant_id()` para
  `#>> '{user_metadata,tenant_id}'`), com teste de isolamento em staging usando JWT real; ou
  documentar explicitamente que o enforcement é exclusivamente application-layer e cobri-lo com
  teste de contrato "toda query de tabela tenant deve conter filtro de tenant".

## Decisão pendente
- **DS-1:** manter enforcement application-only (com teste de contrato) **ou** reativar RLS.
  Requer decisão de arquitetura + validação com JWT real (fora do escopo desta etapa).
