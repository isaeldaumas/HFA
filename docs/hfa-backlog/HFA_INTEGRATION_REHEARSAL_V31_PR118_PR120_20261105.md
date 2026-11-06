# HFA — Ensaio de integração V31 + PR #118 + PR #120

Data: 05/11/2026. Código de desenvolvimento: isaeldaumas/HFA.
Worktree independente: /private/tmp/hfa-release-rehearsal-20261105
Branch LOCAL: review/hfa-release-rehearsal-20261105
Origem: main 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd
V31 base do ensaio: 699c4bcec92b8057b17cb7b24504ff33c42d2695
PR #118: e4b8d9c966a8a3cc4bff3112d23ef458e01ed1d9
PR #120: 6920c461404bfd4c41924c511b195d4b03650df0
PR #121: ba6039d710defb0e9cad8abdec3065c31726a5a9, NÃO incluída.

**Não é uma publicação. Nenhuma PR, branch de outro executor, serviço,
banco, migração, configuração Vercel ou objeto remoto foi alterado.**

## 1. Diagnóstico dos repositórios e das PRs

- A branch V31 estava 14 commits à frente de isaeldaumas/HFA/main, sem commits divergentes; seu diff cumulativo é 119 arquivos (mais de 11 mil linhas adicionadas).
- #118, #120 e #121 eram as únicas três PRs abertas, todas em rascunho no diagnóstico.
- Cada PR individual tinha HFA Core CI e regressão SERA reportando SUCCESS no GitHub; **esses checks não validam a combinação nova deste ensaio**.
- #118 conflitou em frontend/src/app/api/admin/settings/password-reset/route.ts.
- #120 conflitou em frontend/src/lib/server/register-handler.ts e frontend/tests/register-compensating-rollback.test.ts; também tocou o contrato protegido SERA de cadastro.
- #121 não apresentou conflito textual com V31, mas não foi incorporada por manter aprovação científica independente.

## 2. Resolução dos conflitos em worktree independente

- #118: adotado o handler Supabase Auth de pedido real de recuperação por e-mail, que NÃO retorna link/token nem alega prova de entrega. A autorização padrão foi elevada de requireAdmin para requirePlatformAdmin, preservando a restrição da V22. A rota delega ao handler novo.
- O teste de segurança platform-admin foi atualizado para inspecionar TANTO a delegação na rota quanto a autorização explícita na implementação delegada. Teste passou (nove rotas globais protegidas).
- #120: adotado o fluxo de cadastro por convite validado por mailbox, com feature flag HFA_REGISTRATION_INVITES_READY desabilitada por padrão, rejeição de senha enviada diretamente, verificação de redirect HTTPS e testes de rollback relativos a convites.
- A política de compensação da #120 preserva a identidade Auth convidada em vez de deletar usuário não comprovadamente criado por essa tentativa. Caso o usuário público não seja registrado, pode restar convite para reconciliação de suporte; não há transação distribuída.
- A regra V31 de identidade de usuário público autoritativo e cobrança transacional não foi enfraquecida.
- Checkout V31 original, PRs #118/#120/#121 e checkout principal do Mac não foram alterados.

## 3. Verificações locais efetuadas no ensaio

- 45/45 testes de recuperação de senha, sessão de recuperação, logs seguros e convite de cadastro passaram.
- Gate platform admin passou com inspeção do novo handler; o contrato de mesmo-origin com API legada intencional passou com NEXT_PUBLIC_API_URL configurada conforme o teste.
- TypeScript sem erros, build Next.js 16.4.5 PASS com configuração fictícia e recursos Shadow OFF.
- Gemini jornada 1 PASS (56 assertions), multifile 2 PASS (5 grupos), tenancy 3 PASS (38 assertions), readiness 4 PASS (3 módulos sintéticos, não staging real).
- Mais 41/41 testes de autorização V28/V30 e operação de crédito V31 passaram.
- Auditoria estática de isolamento tenant PASS (12 cenários).
- ESLint: 0 erros, 29 avisos. npm audit (dependências de produção e conjunto geral): ambos PASS com 0 vulnerabilidades reportadas no instante da consulta.
- Regressão SERA determinística integrada: **CI_PASS**, 251 casos no manifesto, 198 selecionados, 196 executados, **194 PASS**, 0 FAIL, 0 TIMEOUT e 2 NOT_READY esperados. Executado sobre commit 13ae986. Os 2 NOT_READY não liberam a validação científica V04.
- Quatro relatórios de tests/sera-vnext/engine-validation-v0/reports, regenerados pelo runner, foram restaurados aos bytes do commit. O teste não gerou novo resultado científico versionado. Log do Mac: /private/tmp/hfa-rehearsal-sera-deterministic.log.
- A única modificação após o CI_PASS é a inclusão desta evidência documental; código e contratos testados permanecem idênticos.

## 4. Estado de infraestrutura atual (somente leitura)

- Repositório desenvolvimento: isaeldaumas/HFA (permissão GitHub de escrita na conta conectada).
- Repositório ligado à Vercel produção: system-hfa/HFA (conta conectada tem apenas permissão de leitura). Main desse repositório estava em 315eac1a4..., distinto de main de desenvolvimento.
- Projeto Vercel: systemhfa, ID prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa, rootDirectory frontend, alias de produção READY. O alias READY NÃO prova que a V31 esteja publicada.
- A consulta de nomes/targets de variáveis Vercel NÃO encontrou HFA_PLATFORM_ADMIN_AUTH_USER_IDS nem HFA_REGISTRATION_INVITES_READY. Não foram consultados valores de secrets.
- O Vercel tem variáveis Supabase tanto para preview quanto para production, mas isso NÃO comprova projeto, banco, Auth e Storage independentes.
- Um Supabase HFA separado para staging ainda NÃO foi identificado na conexão. Não aplicar as migrações V29/V31 em produção para testar.
- As variáveis de administrador global/convites não devem ser inseridas sem checar domínio público, e-mail/SMTP, restrições de acesso e projeto-alvo.

## 5. Sequência proposta de integração, sujeita a autorização

1. Obter autorização específica para push da branch de ensaio a isaeldaumas/HFA e abrir PR em rascunho sem merge. Marcar dependências de PR #118 e PR #120 e preservar PR #121 independente.
2. Executar GitHub Core CI remoto na COMBINAÇÃO, inclusive job de concorrência PostgreSQL 16 V31, check de dependências, testes e regressão SERA.
3. Designar repositório canônico de publicação e projeto Vercel de staging independente. Não redirecionar automaticamente o Git link de produção, porque há gatilhos de deploy por branch.
4. Provisionar Supabase staging separado e dois tenants sintéticos, Auth e Storage exclusivos. Aprovar migração SQL V31 somente em staging, depois habilitação MIME V29 via Storage API em staging.
5. Deploy apenas de preview/staging após identificação e autorização, seguido de E2E com dados sintéticos: convite e recuperação de e-mail, papéis, isolamento de tenant, upload, análise, crédito, estorno, exclusão e callbacks.
6. Resolver eventual incompatibilidade de clientes da antiga API Python POST /events (HTTP 410) e estabelecer reconciliador de débito confirmado sem resultado científico.
7. Reavaliar governança dos locks SERA V04: a PR #121 é cientificamente independente. Merge/deploy de produção exigem autorização explícita separada.

**Critério de não liberação:** falta de staging isolado, RPC não aplicada no staging,
fluxo de e-mail não homologado, tests remotos combinados não executados,
ou V04 NOT_READY para qualquer requisito científico que a liberação alegue satisfazer.

## 6. Riscos específicos de produto

- Cadastro por convite da #120 muda o contrato de registro: clientes de cadastro por senha antiga receberão HTTP 400; com gate não habilitado, novos cadastros recebem HTTP 503. Decisão de lançamento necessária antes de produção.
- Recuperação de senha da #118 depende de mailer Supabase configurado e URL pública HTTPS correta. Resposta de API aceita não confirma entrega na caixa postal.
- A V31 depende da migração transacional no banco antes do deploy da aplicação. Sem a RPC, o débito falha fechado (503).
- Integração local não equivale a revisão por pares nem validação real de Auth, RLS e envio de e-mails.
