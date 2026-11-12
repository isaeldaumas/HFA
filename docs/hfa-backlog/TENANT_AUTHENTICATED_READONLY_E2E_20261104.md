# HFA — Homologação autenticada de isolamento entre duas organizações (somente leitura)

**Preparado em:** 04/11/2026 · **Atualização para produção controlada:** 12/11/2026
**Situação:** `HARNESS_READY` · `AUTHENTICATED_CROSS_TENANT_E2E=NOT_RUN`
**Relação:** issue #13 (pré-ativação shadow), #14 (promoção), #15 (dados humanos reais)

## Objetivo e limite de evidência

Comprovar, **em preview ou em produção com fixtures sintéticas e opt-in duplo**, que dois usuários de
organizações sintéticas distintas podem listar e consultar seus próprios
eventos, mas recebem HTTP 404 quando tentam ler o evento sintético da outra
organização. Não modifica contas, eventos, créditos, migrações ou projetos.

Não equivale a validar todo o RLS PostgreSQL nem a autorização de todas
as rotas; é um teste ponta a ponta **parcial** da API de eventos.

## Pré-requisitos não disponíveis nesta rodada

- Dois tenants **sintéticos** A e B, independentes, com usuários autorizados
  e tokens de sessão temporários válidos, distintos.
- Um evento de teste de cada tenant, declarado previamente e cujo identificador
  permaneça conhecido ao executor; ambos precisam ser legíveis pelo próprio
  usuário no ambiente.
- O endpoint HTTPS exato e confiável. Em produção, somente domínios explicitamente permitidos no código, tenants e eventos sintéticos, sem dados de clientes; apagar fixtures ao final.
- Autorização explícita para usar essas credenciais de teste no ambiente alvo.

Não usar credenciais, UUIDs ou registros de clientes de produção como fixtures.

## Comando

Na pasta `frontend`, configurar variáveis **apenas na sessão segura do
terminal**, não em arquivos versionados:

```text
HFA_E2E_BASE_URL=https://systemhfa.vercel.app
HFA_E2E_EXPECTED_HOST=systemhfa.vercel.app
HFA_E2E_PRODUCTION_READONLY_APPROVED=YES
HFA_E2E_SYNTHETIC_FIXTURES_APPROVED=YES
HFA_E2E_TOKEN_A=<token-efemero-sintetico-A>
HFA_E2E_TOKEN_B=<token-efemero-sintetico-B>
HFA_E2E_TENANT_A_ID=<uuid-sintetico-A>
HFA_E2E_TENANT_B_ID=<uuid-sintetico-B>
HFA_E2E_EVENT_A_ID=<uuid-evento-sintetico-A>
HFA_E2E_EVENT_B_ID=<uuid-evento-sintetico-B>
```

Executar `npm run test:tenant:e2e:readonly` na sessão com essas variáveis.

A produção continua bloqueada por padrão. O runner só aceita um dos domínios
de produção explicitamente listados no código com as duas flags
HFA_E2E_PRODUCTION_READONLY_APPROVED=YES e
HFA_E2E_SYNTHETIC_FIXTURES_APPROVED=YES. O opt-in para produção não é
válido para preview ou domínio arbitrário. Redirecionamentos, HTTP aberto
e login por service-role não são aceitos.

## Seis verificações GET no ambiente autorizado

| Identidade | Consulta | Esperado |
| --- | --- | --- |
| Usuário A | `GET /api/events` | 200, nenhuma linha de B |
| Usuário A | `GET /api/events/<evento-A>` | 200, owner A |
| Usuário A | `GET /api/events/<evento-B>` | **404** |
| Usuário B | `GET /api/events` | 200, nenhuma linha de A |
| Usuário B | `GET /api/events/<evento-B>` | 200, owner B |
| Usuário B | `GET /api/events/<evento-A>` | **404** |

Os retornos são lidos apenas em memória, limitados a 2 MiB por resposta.
O relatório apresenta **contadores e códigos**, não eventos, UUIDs ou JWTs.
Qualquer resposta inesperada, erro de rede, ausência de fixture ou vazamento
de linha de outro tenant resulta em falha fechada; sem fixtures, retorna
`NOT_READY_OR_FAILED` (não PASS).

## Testes automáticos de contrato

`node --test frontend/tests/two-tenant-readonly-e2e.test.mjs`:
13 testes sintéticos verificam leitura de próprio tenant, negativa
entre tenants, falha por contaminação da lista, falta de fixture, bloqueio padrão em produção, opt-in de produção limitado a host conhecido, SSRF, tamanho de resposta e redação de erros.

**Esses 11 testes de CI não substituem o ensaio autenticado real.**

## Cuidados pós-execução

Revogar ou expirar os tokens de teste; guardar somente um checkpoint
com commit, deployment, ambiente e contagem dos seis GETs. Não guardar
corpo JSON nem JWT no GitHub. Se houver falha de isolamento, não ativar
shadow ou promover o motor; abrir issue P0 sem anexar dados privados.

## Checkpoint 12/11/2026 — teste real SQL de leitura no Supabase produção

A role authenticated recebeu em transação local um sub sintético não vinculado
a conta (00000000-0000-4000-8000-000000000001). Foram confirmadas ZERO linhas
visíveis em public.events, public.users, public.event_documents e
public.sera_vnext_analyses. Transação revertida com ROLLBACK. Não houve
criação de usuário, evento ou acesso a conteúdo de clientes.

Isso prova ausência de exposição por RLS para um usuário não vinculado,
mas NÃO substitui as seis chamadas HTTP autenticadas com JWT A e B de
contas sintéticas distintas. O status do E2E autenticado permanece NOT_RUN.
