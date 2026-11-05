# HFA V30 — Ator de escrita autoritativo, sem reprovisionamento implícito

**Data:** 05/11/2026. **Branch local:** review/hfa-gemini-integration-20261105.

## Diagnóstico

O frontend já validava o JWT por Supabase Auth e resolvia tenant, papel e
public.users.id em requireBearerUser / resolveAuthorizedUserContext, mas sete
módulos continuavam chamando ensurePublicUserRow com os campos Auth, email e
papel. O auxiliar antigo, usando service-role, fazia:
- Busca por public.users.id sem conferir tenant e vínculo Auth;
- fallback por email sem restringir tenant ou exigir exclusividade/atividade;
- criação de public.users com role do contexto quando não encontrava registro.

Esse passo podia escolher uma conta pública de outra empresa ou criar uma
segunda conta por engano. A validação inicial do bearer reduzia o risco de
exploração direta, mas não justificava uma nova resolução permissiva com
service-role, particularmente em condições de divergência, conta desativada
ou alteração de email.

## Correções locais

1. frontend/src/lib/server/tenant-user.ts: ensurePublicUserRow mantém o nome
   por compatibilidade, mas tornou-se uma **revalidação somente leitura** do
   ApiUserContext já autenticado. Seleciona a linha por publicUserId e tenantId,
   exige is_active=true e role idêntico, e valida a correspondência do
   auth_user_id conforme identityBinding DIRECT_AUTH_ID, EXPLICIT_AUTH_LINK ou
   LEGACY_CONFIRMED_EMAIL. Em legado sem auth_user_id exige email coerente com
   a identidade previamente confirmada pelo resolver.
2. Proibidos INSERT, busca por email, autorregistração e fallback por outra
   empresa dentro deste auxiliar. Uma inconsistência resulta em erro fechado.
3. Corrigidos sete módulos consumidores: eventos, análise, risco, triagem,
   esclarecimentos, exportação PDF e produto SERA beta. Os oito usos da
   função utilizam o ApiUserContext do token já validado.
4. frontend/src/app/api/auth/me/route.ts e
   frontend/src/lib/server/admin-auth.ts passam a buscar papel por
   publicUserId **e tenantId**, rejeitando erro de banco ou linha ausente
   sem fazer fallback silencioso ao papel antigo.
5. tests/hfa-audit/tenant-isolation/tenant-isolation-contract-trial-001.ts:
   contrato estático reforçado para não confundir requireAdmin
   (administrador de uma empresa) ou requireBearerUser
   (identidade autenticada) com autorização global ou filtro SQL. Os três
   endpoints administrativos globais continuam aceitos apenas pela guarda
   específica requirePlatformAdmin (allowlist do operador); auth/me recebeu
   filtro tenant explícito.
6. .github/workflows/hfa-core-ci.yml inclui os testes dinâmicos V30.

## Evidências e limites

- tests/hfa-audit/gemini-tenancy-security/v30-authoritative-write-actor.test.ts
  executa 12 testes de função real com dublês Supabase, incluindo identidade
  direta, legado vinculado, fallback sem vínculo confirmado previamente,
  outras empresas, usuário inativo, alteração de papel, conflito Auth/DB,
  falta de linha, erro de consulta e ausência de inserts.
- Testes V28 de autorização e regressões Gemini permanecem obrigatórios.
- 12/12 testes V30 e 16/16 testes V28 de identidade/autorização PASS.
- Suíte de jornada Gemini 1: PASS (56 asserts).
- Suíte de upload Gemini 2: PASS (5 grupos).
- Suíte de segurança Gemini 3: PASS (38 asserts).
- Suíte de prontidão Gemini 4: PASS (3 módulos de contrato; staging
  real e V04 continuam NOT_VERIFIED/NOT_RUN).
- Auditoria estática de isolamento tenant: 12 cenários PASS depois de
  distinguir autenticação Bearer de autorização global. O teste continua
  heurístico e não substitui testes RLS reais.
- TypeScript PASS; ESLint: 0 erros, 29 avisos; build Next.js 16.4.5 PASS
  com variáveis fictícias e flags Shadow OFF. YAML do Core CI válido.
- Nenhum teste nesta V30 alterou políticas RLS, banco, Auth, contas ou Storage.
- A consulta agregada read-only anterior à produção encontrou 8 usuários
  com vínculo Auth direto, 0 legacy sem vínculo e 0 conflitos no instante da
  consulta. Nenhuma informação pessoal individual foi coletada.
- Testes offline não substituem E2E com dois tenants reais em staging.
- Não autoriza alteração de RBAC, RLS, produção, oráculos SERA V04 nem
  bootstrap de usuários reais.

## Dívida técnica identificada para trabalho separado

debitCreditForEvent/refundCreditForFailedAnalysis ainda realizam
read-modify-write de credits_balance e INSERT de credit_transactions via
chamadas independentes sem transação única. Em concorrência, o saldo pode
ficar inconsistente; erros de SQL também precisam de confirmação explícita.
Essa condição exige solução transacional e projeto de RPC com migração,
homologado em banco isolado. Nenhuma migração/alteração de créditos foi
aplicada remotamente nesta etapa.

**Governança:** apenas alterações no commit local isolado; não houve push,
merge, deploy nem escrita remota.

## Regressão SERA integral pós-commit (evidência adicional)

O executor scripts/run-sera-vnext-ci-regression.ts foi executado sobre o
código V30 já commitado, com checkout inicialmente limpo.
Resultado: 251 casos no manifesto, 198 selecionados, 196 executados,
194 PASS, 0 FAIL, 0 TIMEOUT, 2 NOT_READY esperados, estado final CI_PASS.
Os 2 NOT_READY não liberam a validação científica V04 nem os oráculos selados.

O runner regenerou quatro relatórios em
tests/sera-vnext/engine-validation-v0/reports; todos foram restaurados
ao conteúdo do commit, sem registrar diferenças científicas.
Log apenas no Mac autorizado:
/private/tmp/hfa-v30-sera-regression.log

A alteração final do commit V30 após essa execução foi exclusivamente
esta nota de evidência documental, sem alteração em código, fixtures,
oráculos ou políticas de execução.
