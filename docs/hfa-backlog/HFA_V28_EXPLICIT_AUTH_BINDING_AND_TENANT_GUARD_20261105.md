# HFA V28 — Vínculo autoritativo de identidade e segregação de tenants

Data: 05/11/2026. Branch de revisão local: review/hfa-gemini-integration-20261105.

## Diagnóstico inicial

A V23 já havia corrigido o POST/DELETE legado que gravava linhas de auditoria para eventos de outro tenant sem comprovar a posse. Isso foi confirmado por leitura de frontend/src/app/api/events/[eventId]/route.ts e pelo teste estático test-hard-delete-tenant-ownership.ts. Não reimplementar uma correção já realizada.

Entretanto, o resolvedor central frontend/src/lib/server/authorized-user-context.ts não consultava public.users.auth_user_id:
- Na correspondência direta por public.users.id, era possível aceitar a linha mesmo que o campo auth_user_id fosse explicitamente de outra conta Auth.
- O fallback por e-mail confirmado podia corresponder a linha já vinculada a Auth distinto.
- Se a linha por id e outra linha por auth_user_id apontassem para o mesmo ID Auth, não havia detecção de ambiguidade; essa configuração pode ocorrer mesmo com índice único parcial de auth_user_id, pois a coluna ID é chave diferente.
- Usuários legados com public.users.id diferente de auth.users.id mas com auth_user_id explicitamente correto dependiam do e-mail, mesmo quando este havia mudado.

O resolvedor Python backend/app/api/authoritative_user.py já implementava correspondência direta, explícita e fallback de e-mail, com proteção para conflito entre os dois índices. A implementação Next.js divergia desse comportamento.

## Correções locais

1. Resolve o usuário por dois índices do banco, public.users.id e public.users.auth_user_id, antes de estabelecer qualquer tenant ou papel.
2. Rejeita colisão entre a linha direta e a linha explicitamente vinculada, se seus IDs públicos divergirem. Falha de leitura de qualquer índice bloqueia autorização.
3. Rejeita qualquer campo auth_user_id preenchido com outro identificador autenticado, inclusive no fallback por e-mail.
4. Quando public.users.id difere do ID Auth, aceita vínculo explícito válido sem depender de confirmação de e-mail (a identidade já foi autenticada pelo Supabase Auth). Marca identityBinding=EXPLICIT_AUTH_LINK.
5. Mantém LEGACY_CONFIRMED_EMAIL apenas quando email_confirmed_at existe, a correspondência é única/ativa e auth_user_id está ausente ou pertence ao mesmo usuário.
6. Aplica verificações equivalentes a resolvePublicUserId, responsável pelos IDs de auditoria em exclusão/recuperação. Mantém o escopo tenant_id obrigatório nas consultas e não autoriza uma linha em outro tenant.
7. Atualiza o contrato de fonte para exigir auth_user_id na consulta e cria dezesseis testes de função real com base e Auth sintéticos em memória. Inclui a suíte no Core CI; não executa rede nem grava dados.

## Verificações factuais

Read-only, por agregação no projeto Supabase HFA ativo vbdpweliprcsktyxodss:
- total de linhas em public.users: 8;
- 8 vínculos diretos de public.users.id = public.users.auth_user_id;
- 0 usuários com auth_user_id nulo;
- 0 vínculos explícitos com IDs diferentes;
- 0 colisões entre IDs diretos e vínculos explícitos.

Nenhum e-mail, ID individual, credencial, conteúdo de evento ou dado pessoal foi consultado. Nenhuma alteração remota foi executada. As contagens pontuais não comprovam segurança futura ou completa.

Offline:
- 16 testes dinâmicos novos de autorização e ator de exclusão, incluindo conflito direto, vínculo explícito, legado, inatividade e isolamento entre tenants;
- suíte Gemini 3 (38 assertions) e contratos legados de autorização passaram;
- suíte multifile V27 (4 grupos) continuou passando;
- TypeScript sem erros; ESLint concluiu com 0 erros e 29 avisos.
Build Next.js 16.4.5 com flags Shadow OFF e credenciais fictícias PASS, sem runtime conectado ao Supabase.
Core CI YAML validado localmente. Python 3.12 e GitHub Actions remotos não são evidências deste ciclo.

## Governança e bloqueios

- O repositório Vercel de produção continua vinculado à origem histórica system-hfa/HFA, e não ao repositório isaeldaumas/HFA. Não sincronizar por força.
- O bucket Storage production analysis-documents continua restrito a PDF/DOCX. A migração V27 está apenas em arquivo; não aplicada.
- Nenhum staging independente com dois tenants foi comprovado.
- Os bloqueios metodológicos da SERA V04 permanecem. Não alterar metodologia, oráculos, fixtures, dados científicos ou resultados selados.
- A branch é local. Não houve push, PR nova, merge, alteração de Auth, mutação de dados ou deployment. Publicação exige revisão e autorização específica.

**Estado:** candidato local com autorização mais restrita; não significa liberação de produção.
