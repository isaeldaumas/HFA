# Suíte Automatizada de Isolamento entre Tenants

`tests/hfa-audit/tenant-isolation/tenant-isolation-contract-trial-001.ts` — não faz parte do
manifesto oficial (`tests/sera-vnext/test-manifest.json`).

## Por que contrato estático, não teste de banco real

Mesma limitação de ambiente da primeira e segunda etapa: não há Supabase real/local disponível
autorizado para uso nesta sessão. Um teste de banco (inserir tenant A e B, tentar cruzar) seria
mais realista, mas um **contrato estático sobre o código-fonte** tem uma vantagem: ele pega a
regressão **antes** de qualquer dado real existir, na hora em que o código é escrito — se uma
rota nova esquecer `.eq('tenant_id', ...)`, o teste falha no CI, sem depender de alguém lembrar
de rodar os testes `REAL_DB` do manifesto oficial. Os dois se complementam; este não substitui
os testes `REAL_DB`/`REAL_API` já existentes no manifesto (que requerem Supabase de staging).

## Cobertura dos 12 cenários pedidos

| # | Cenário | Mecanismo de verificação | Resultado |
|---|---|---|---|
| 1 | Leitura cruzada | Toda rota que toca tabela tenant-scoped tem `.eq('tenant_id', ...)` ou usa helper conhecido | PASS |
| 2 | Atualização cruzada | Mesmo mecanismo (cobre `.update`/`.upsert`) | PASS |
| 3 | Exclusão cruzada | Mesmo mecanismo (cobre `.delete`/RPCs de soft-delete) | PASS |
| 4 | Acesso direto por ID | Rotas `[id]`/`[analysisId]`/`[eventId]` combinam filtro de tenant | PASS |
| 5 | Exportação | Rota de export do vNext delega ao handler tenant-scoped | PASS |
| 6 | Storage | Path de upload prefixado por `userId/analysisId` | PASS |
| 7 | RPC | Chamadas de RPC usam `tenantId`/`p_tenant_id` derivado do usuário autenticado | PASS |
| 8 | Ausência de tenant | `requireBearerUser` rejeita com 403 quando `tenant_id` ausente | PASS |
| 9 | Tenant manipulado pelo cliente | Nenhuma rota lê `tenant_id` do corpo/query | PASS |
| 10 | Relação indireta | `corrective_actions` consultado com filtro de `tenant_id` | PASS |
| 11 | Shadow result de outro tenant | Funções de leitura de `sera-shadow/repository.ts` filtram por `tenant_id` | PASS |
| 12 | Comparação legado×vNext de outro tenant | Orquestrador de shadow propaga `tenantId` do contexto autenticado | PASS |

## Exceções documentadas (não são falhas silenciosas)

`app/api/auth/register/route.ts` e `app/api/auth/oauth/bootstrap/route.ts` tocam a tabela
`users`/`tenants` sem filtro de `tenant_id` — porque são os próprios fluxos de **criação** do
tenant (não há "outro tenant" a isolar: o tenant do usuário ainda não existe nesta chamada). O
teste declara essas duas rotas como allowlist explícita, documentada no próprio arquivo de
teste, não como uma exceção silenciosa.

## Validação de que o teste não é vazio

Antes de chegar à versão final, o teste **de fato pegou dois falsos positivos** (as duas rotas
de bootstrap acima) e um erro de lógica do próprio teste (checagem incorreta em
`sera-shadow/repository.ts` que exigia filtro de tenant também em funções de escrita, onde o
`tenant_id` já vem no próprio registro inserido). Isso confirma que o teste de fato examina o
código e não passa trivialmente.

## Resultado
`TENANT_ISOLATION_CONTRACT_TRIAL_OK` — 12/12 cenários PASS.
