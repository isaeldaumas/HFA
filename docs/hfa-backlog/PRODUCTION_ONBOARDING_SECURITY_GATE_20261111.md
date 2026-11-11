# HFA — Contenção do cadastro em produção — 11/11/2026

## Situação anterior (verificada no código e configuração pública)

- `/api/auth/register` usava `admin.createUser({email_confirm:true})` e concedia trial antes de prova de posse do email.
- `/api/auth/oauth/bootstrap` autorizava qualquer identidade Supabase Auth válida sem associação existente em `public.users` a obter novo tenant, créditos trial e papel admin.
- Supabase Auth público informou `disable_signup=false` e `mailer_autoconfirm=false`, permitindo inscrição direta na API Auth mesmo fora do HFA. A confirmação de email não é equivalente à autorização de criação de empresa.

## Contenção de aplicação implementada

1. A API de cadastro usa apenas o mecanismo de convite Supabase Auth, sem aceitar senha ou atribuir `email_confirm=true`. Um convite não equivale a email entregue. Quando `HFA_REGISTRATION_INVITES_READY` está ausente ou diferente de `true`, retorna 503 **antes de analisar o corpo ou usar service_role**. As credenciais Turnstile são obrigatórias quando a flag for ativada.
2. Na ausência de sitekey Turnstile pública, o formulário informa que novos cadastros estão temporariamente indisponíveis, com link para o login de contas existentes.
3. O endpoint `/api/auth/oauth/bootstrap` deixa de criar qualquer novo tenant/usuário por identidade apenas autenticada. Somente associações previamente provisionadas em `public.users` podem ser aceitas; contas existentes não são apagadas.
4. Nenhuma migração, alteração de créditos, exclusão de usuários ou autenticação real foi executada por esta mudança de código.

## Bloqueios que persistem (não declarar issue #106 concluída)

- **Supabase hospedado:** a flag `disable_signup` permanece `false` até configuração administrativa revisada e validada na produção. Desabilitar inscrição direta não deve impedir sign-in de usuários existentes; testar também bypass por Auth Google/OTP.
- **Admissão de novos clientes:** falta configurar SMTP confiável, templates e allowlist `/accept-invite`, chaves Turnstile, proteção distribuída e atômica por email/IP, custo e limites de trial, e ensaio com caixa de email/tenants sintéticos autorizados.
- **Recuperação:** falta teste de entrega de email e validação do link; a UI existente foi publicada com confirmação de recebimento explicitamente não garantida.
- **Dados legados:** investigar contas Auth sem registro `public.users`, sem vincular automaticamente a tenant nem apagar identidades reais.

## Rollback

Não reativar o cadastro antigo com `email_confirm:true`. Em incidentes de autenticação, restaurar somente a rota/versão funcional para usuários existentes mediante comparação e verificação de SHA. Não promover SERA vNext ou Shadow como consequência deste release.
