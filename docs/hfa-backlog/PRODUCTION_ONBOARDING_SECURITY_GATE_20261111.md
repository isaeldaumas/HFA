# HFA — Contenção do cadastro em produção — 11/11/2026

## Situação anterior (verificada no código e configuração pública)

- `/api/auth/register` usava `admin.createUser({email_confirm:true})` e concedia trial antes de prova de posse do email.
- `/api/auth/oauth/bootstrap` autorizava qualquer identidade Supabase Auth válida sem associação existente em `public.users` a obter novo tenant, créditos trial e papel admin.
- Supabase Auth público informou `disable_signup=false` e `mailer_autoconfirm=false`, permitindo inscrição direta na API Auth mesmo fora do HFA. A confirmação de email não é equivalente à autorização de criação de empresa.

## Contenção de aplicação implementada

1. A API de cadastro usa apenas o mecanismo de convite Supabase Auth, sem aceitar senha ou atribuir `email_confirm=true`. Um convite não equivale a email entregue. Quando `HFA_REGISTRATION_INVITES_READY` está ausente ou diferente de `true`, retorna 503 **antes de analisar o corpo ou usar service_role**. As credenciais Turnstile são obrigatórias quando a flag for ativada. Mesmo após verificar Turnstile, a API consulta a configuração pública da Auth e só permite convites se `disable_signup=true`, `mailer_autoconfirm=false` e o provedor de email permanecer habilitado; falhas de rede bloqueiam o cadastro.
2. Na ausência de sitekey Turnstile pública, o formulário informa que novos cadastros estão temporariamente indisponíveis, com link para o login de contas existentes.
3. O endpoint `/api/auth/oauth/bootstrap` deixa de criar qualquer novo tenant/usuário por identidade apenas autenticada. Somente associações previamente provisionadas em `public.users` podem ser aceitas; contas existentes não são apagadas.
4. Nenhuma migração, alteração de créditos, exclusão de usuários ou autenticação real foi executada por esta mudança de código.

## Bloqueios que persistem (não declarar issue #106 concluída)

- **Supabase hospedado:** auth.enable_signup=false foi aplicado em producao em 11/11/2026 e o diff remoto confirmou zero divergencias. Email/confirmacoes foram preservados; a API continua verificando de forma fail-closed antes de permitir convite.
- **Admissão de novos clientes:** falta configurar SMTP confiável, templates e allowlist `/accept-invite`, chaves Turnstile, proteção distribuída e atômica por email/IP, custo e limites de trial, e ensaio com caixa de email/tenants sintéticos autorizados.
- **Recuperação:** falta teste de entrega de email e validação do link; a UI existente foi publicada com confirmação de recebimento explicitamente não garantida.
- **Dados legados:** investigar contas Auth sem registro `public.users`, sem vincular automaticamente a tenant nem apagar identidades reais.

## Rollback

Não reativar o cadastro antigo com `email_confirm:true`. Em incidentes de autenticação, restaurar somente a rota/versão funcional para usuários existentes mediante comparação e verificação de SHA. Não promover SERA vNext ou Shadow como consequência deste release.

## Incremento — limitação distribuída por email

O convite ganha uma quota atômica compartilhada (PostgreSQL, transação e índice único): 3 tentativas por hora e 8 por dia por email normalizado. Os identificadores armazenados são HMAC-SHA256 gerados com HFA_REGISTRATION_RATE_LIMIT_SECRET, nunca endereços de email brutos. O segredo fica exclusivamente no servidor Vercel e deve ter ao menos 32 bytes UTF-8. Falhas de RPC/DB ou segredo ausente retornam 503, e limites excedidos retornam 429. Não há criação de empresa nem convite nesses casos. O WAF conserva seu limite por IP; a tabela privada elimina de forma limitada registros expirados após 3 dias. A função é SECURITY INVOKER, com EXECUTE apenas ao service_role.

Mesmo com o rate limiter configurado, HFA_REGISTRATION_INVITES_READY permanece ausente em produção; novos cadastros NÃO estão liberados nem homologados.

Migration Supabase prod: version 20261111223334 (registration_email_atomic_rate_limit), verificada no ledger. O arquivo original foi renomeado sem alterar o SQL para manter o historico do repositorio coerente com a execucao real.
