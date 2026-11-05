# HFA — V25, uma única via de cadastro e controle de falhas compensatórias

**Data:** 2026-11-05. Branch de revisão local review/hfa-gemini-integration-20261105. Sem push, merge, deploy, alteração de dados remotos ou concessão de autorização de produção.

## Diagnóstico

A V24 corrigiu defeitos do /auth/register do Python FastAPI, mas o próprio fluxo seguia duplicado com o cadastro autoritativo Next.js /api/auth/register. O Python realizava auth.sign_up antes de criar a empresa; uma falha entre as operações poderia deixar um auth.users sem public.users ou uma empresa órfã. A página de cadastro Next chamava apiCall('/auth/register'); quando NEXT_PUBLIC_API_URL estava definido, o roteador de cliente mandava a solicitação ao Python, ignorando a implementação Next e a política WAF aplicada somente à rota Next.

## Correções realizadas

1. frontend/src/lib/api.ts: cadastro (/auth/register), /auth/oauth/bootstrap e /auth/bootstrap são sempre resolvidos para /api/* na origem Next.js, independentemente de NEXT_PUBLIC_API_URL. Login legado não é alterado.
2. backend/app/api/routes/auth.py: rota pública legada de cadastro retorna HTTP 410, sem receber parâmetros e sem tocar Auth/PostgREST. O bootstrap Python ainda resolve perfis já cadastrados por vínculo autoritativo, mas deixa de criar novos tenants; usuários novos recebem HTTP 410 e devem usar /api/auth/oauth/bootstrap. Isto altera intencionalmente a compatibilidade dos clientes diretos do FastAPI.
3. frontend/src/lib/server/register-handler.ts: quando a inserção em public.users falha e a exclusão do Auth não pode ser concluída, o cleanup preserva a empresa provisória e devolve erro de cadastro incompleto. Evita destruir a referência do possível usuário Auth sobrevivente e exige reconciliação por suporte autorizado. Não presume conta validada ou acesso concedido.

## Testes executáveis

- tests/hfa-audit/gemini-tenancy-security/test-canonical-signup-routing.ts: iniciando com NEXT_PUBLIC_API_URL=https://legacy-not-trusted.example, testa que os três caminhos de cadastro/bootstrap, mais dois SERA, ficam na origem Next, enquanto /auth/login permanece no remoto legado.
- frontend/tests/register-compensating-rollback.test.ts: adaptado para exigir preservação do tenant quando auth.admin.deleteUser falha. Demais testes verificam cleanup nos demais cenários de sucesso e erro.
- backend/tests/test_legacy_routes_hardening.py: cadastro retorna 410 sem escrita; OAuth bootstrap de conta ainda não vinculada retorna 410 sem escrita; usuários vinculados mantêm a consulta segura.
- backend/tests/test_fastapi_route_runtime_v24.py: TestClient real garante HTTP 410 em cadastro válido e malformado, sem acesso a banco/credential, e HTTP 410 no bootstrap novo.
- Core CI passou a executar o teste de roteamento, com URL externa legada deliberadamente configurada como condição adversária.

Os testes são offline e usam dublês; NÃO equivalem à autenticação real, à recuperação de cadastro em produção ou à prova de configuração do WAF na Vercel.

## Restrições e riscos remanescentes

- Não há transação única envolvendo Supabase Auth e Postgres. O Next.js usa compensação best-effort; falha na própria compensação ainda exige reconciliação manual. Nenhum usuário ou empresa foi criado, removido ou reconciliado remotamente nesta etapa.
- O endpoint FastAPI legado de cadastro fica intencionalmente indisponível. É obrigatório verificar integrações e clientes diretos antes do deploy. O Next.js chama o endpoint canônico mesmo com variável de backend legada configurada.
- O CORS Python requer lista explícita de origens legítimas, sem curingas Vercel. O projeto Vercel continua vinculado a repositório legado; staging real não foi comprovado.
- Antes de publicação: testar signup Next.js em staging isolado com credenciais sintéticas, 429 WAF, rollback de Auth/tenant em falhas parciais, autorização por tenant e taxa real de aceitação do endpoint.
- A presença de código científico legado no Python NÃO autoriza sua execução ou reutilização. SERA V04 e demais bloqueios científicos permanecem fechados.

**Status:** melhoria de segurança consolidada localmente, sem deploy nem merge na main; demanda homologação antes de promoção.
