# HFA V31 — Controle transacional de créditos e bloqueio de cobrança legada

Data: 05/11/2026. Branch isolada: review/hfa-gemini-integration-20261105. Repositório: isaeldaumas/HFA.

**Status: implementação e testes locais. Nenhum push, PR, merge, deploy ou mutação no Supabase conectado.**

## Diagnóstico

As rotas Next.js faziam débito/estorno de créditos em solicitações independentes ao Supabase: leitura de saldo, atualização por valor absoluto e gravação de credit_transactions. A concorrência podia causar atualização perdida, saldo divergente e estornos duplicados. O endpoint antigo POST /events do FastAPI repetia esse padrão e disparava execução científica pela implementação legada.

## Correção local

- Migration criada pelo Supabase CLI: supabase/migrations/20261105235446_hfa_atomic_credit_operations_v31.sql.
- Acrescenta identificador de operação por tentativa e flag do efeito real sobre saldo no livro de créditos, mantendo transações históricas intactas.
- Índice único parcial por tenant, UUID de tentativa e tipo de transação; permite tentativas novas do mesmo evento após estorno, sem duplicar uma tentativa.
- Função pública hfa_apply_credit_operation_v31, com SECURITY INVOKER, search_path vazio, acesso somente ao papel service_role (EXECUTE revogado de PUBLIC, anon e authenticated).
- Função bloqueia a linha do tenant e valida tenant, usuário, evento, período de trial e saldo no banco. Atualiza saldo, events.credits_used e credit_transactions numa única transação, com rollback em qualquer erro.
- Debita a primeira análise de um evento uma só vez enquanto ativa; não altera a cobrança de reanálises sem débito. Estorno da mesma tentativa é idempotente e não existe sem débito anterior.
- Plano Enterprise preserva o saldo-sentinela ilimitado, sem operações aritméticas sobre -1.
- frontend/src/lib/server/tenant-user.ts substitui as atualizações PostgREST separadas por uma chamada RPC, verificando resposta, UUID e erro.
- Rotas Next.js de eventos e de análises compartilham o UUID entre débito e eventual estorno. A rota de análise de evento existente inclui status e auditoria dentro da seção protegida por compensação.
- POST /events/ legado no FastAPI retorna HTTP 410, sem escrever no Supabase nem disparar análise Python. GETs legados preservados. Esta alteração é incompatível com consumidores externos diretos e exige inventário antes da publicação.

## Evidências executadas localmente

- PostgreSQL 16 isolado por Unix socket sob /private/tmp, com dados sintéticos: 38 verificações PASS.
- Segundo PostgreSQL temporário acessível somente em 127.0.0.1 e com schema recriado do zero: migration, bootstrap e as mesmas 38 verificações PASS; processo de teste encerrado.
- Nos testes: 12 tentativas simultâneas com 3 créditos produzem 3 débitos e 9 negativas; 8 tentativas simultâneas para o mesmo primeiro evento produzem só 1 débito; repetições simultâneas de débito e estorno são idempotentes; evento e saldo são revertidos se a inserção no livro falhar.
- ACL verificada no PostgreSQL real: anon=sem EXECUTE, authenticated=sem EXECUTE, service_role=com EXECUTE.
- Teste da camada Next.js: 13/13 PASS; Gemini 1: 56/56 PASS; Gemini 2: cinco grupos PASS; Gemini 3: 38/38 PASS; Gemini 4: três módulos de prontidão sintética PASS.
- V28+V30: 28/28 PASS. Backend Python: 34/34 PASS, incluindo TestClient real com POST legado 410 e nenhuma escrita.
- TypeScript sem erros; ESLint 0 erros e 29 avisos; build Next.js 16.4.5 PASS com variáveis fictícias e Shadow OFF.
- Core CI validado em YAML. Novo job de teste em postgres:16 temporário com schema sintético e sem credenciais Supabase reais. CI remoto não foi executado.

## Conclusões de segurança e limitações

A migração usa SECURITY INVOKER com concessão explícita apenas a service_role conforme as recomendações atuais do Supabase:
https://supabase.com/docs/guides/database/functions
https://supabase.com/docs/guides/database/postgres/row-level-security

O security advisor remoto foi consultado somente em leitura. Mantém avisos anteriores: proteção de senhas vazadas desativada e cinco tabelas com RLS sem políticas. Nenhum desses itens foi modificado.
https://supabase.com/docs/guides/observability/advisors

O teste usa esquema local mínimo, não uma réplica integral das migrações Supabase. Falta staging real com dois tenants, aplicação controlada da migration, verificação com RLS, autenticação e CI remoto.

O identificador é estável durante uma solicitação; novas solicitações podem obter outro UUID. Há proteção contra cobrança concorrente da primeira análise, mas ainda não há reconciliador durável para processo interrompido após débito ou sucesso científico seguido de falha no status do evento. Não estornar automaticamente sem confirmar o estado científico. O ledger permite futura reconciliação explícita.

Mudança FastAPI POST /events 410 pode afetar clientes diretos; revisar antes de publicar. Repositório Vercel de produção ainda diverge do repositório de desenvolvimento. SERA V04 permanece NOT_READY; nenhum código, lock ou oráculo científico foi alterado.

**Ordem segura de eventual publicação: migration no staging independente, deploy de staging, testes reais de cobrança/estorno com dois tenants, CI e revisão; produção somente após autorização específica.**

## Regressão SERA determinística completa (após commit de código)

O executor scripts/run-sera-vnext-ci-regression.ts foi executado sobre o
commit local V31 antes desta atualização documental:
- 251 casos no manifesto; 198 selecionados; 2 exclusões de CI e 7
  baselines históricos preservados.
- 196 executados; 194 PASS; zero FAIL; zero TIMEOUT; 2 NOT_READY
  esperados; resultado CI_PASS.
- NOT_READY corresponde à validação científica V04, ainda bloqueada.
- Relatórios regravados pelo próprio runner em tests/sera-vnext/engine-validation-v0/reports
  foram restaurados exatamente para os bytes do commit. Nenhum novo
  resultado científico foi gravado no commit.

Log local disponível apenas no Mac autorizado em
/private/tmp/hfa-v31-sera-full.log.
Esta atualização é somente documental; não altera código já testado.
