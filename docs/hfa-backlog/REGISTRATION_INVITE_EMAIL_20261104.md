# HFA — Substituição planejada do registro público por convite verificado

**Data:** 04/11/2026 · **Issue:** #106 · **Situação:** implementação isolada em DRAFT, não autorizada para deploy.

## Comportamento preparado

- `POST /api/auth/register` deixa de criar contas com `email_confirm: true` sem prova de posse.
- O aplicativo coleta nome, empresa, slug e email; não coleta senha antes da verificação.
- Supabase Auth Admin `inviteUserByEmail` solicita envio de convite para o endereço e usa redirecionamento canônico HTTPS para `/accept-invite`. A página só habilita a definição de senha após uma sessão Auth de email confirmado; o cadastro não efetua login imediato.
- `HFA_REGISTRATION_INVITES_READY=true` é intertravamento operacional obrigatório. Na ausência do valor, o backend responde 503 ANTES de qualquer gravação.
- A resposta `invite_requested=true` e `delivery_confirmed=false` não afirma entrega à caixa postal. A entrega não foi homologada.
- Não há exposição do service-role, token de convite, URL de confirmação, senha ou identidade Auth no JSON de resposta.
- O backend preserva validação de entrada, limite de 8192 bytes, tentativa de criação de tenant somente após preflight e bloqueio de campos legados de senha.

## Limites de segurança descobertos

1. **Convites repetidos de identidade não confirmada:** o Supabase pode reenviar convite e devolver um ID preexistente. Portanto, se `public.users` falhar, é proibido excluir automaticamente essa identidade Auth, sob risco de apagar outra conta. O rollback exclui somente o tenant provisório. Um eventual usuário Auth órfão exige reconciliação administrativa com evidência de propriedade; jamais apagar pela simples coincidência de e-mail.
2. **Tentativas paralelas e abuso:** o WAF 10/IP/60s do HFA é parcial. Esta PR NÃO implementa limitador atômico IP/email compartilhado nem desafio anti-bot; ativar `HFA_REGISTRATION_INVITES_READY` sem esses controles é proibido. Emails recebidos em cadastros não autorizados podem ser usados para perturbação/abuso de envios.
3. **Acesso direto do Supabase:** desligar separadamente `disable_signup`, preservando `external.email=true` e `mailer_autoconfirm=false`. A mudança de código não altera essa configuração. Não usar `external_email_enabled=false`.
4. **Vínculo Git/Vercel:** código no GitHub `isaeldaumas/HFA`; projeto Vercel `systemhfa` estava vinculado ao repositório `system-hfa/HFA` na consulta anterior. Não presumir que o merge publique esse código.
5. **Sem caixa postal de teste:** o fluxo de convite, verificação, definição de senha e novo login real permanece NÃO EXECUTADO.

## Requisitos para homologação e ativação

- Configurar remetente, SMTP/hook, template **Invite user** e a URL exata `https://<domínio-oficial>/accept-invite` na allowlist do Supabase Auth. O provider pode ignorar um redirect fora da allowlist sem retornar erro.
- Implementar e testar **antes de habilitar** limitador distribuído atômico IP/email e desafio anti-bot validado no servidor, com proteção contra spoofing de proxy, concorrência, NAT e volume de e-mails; manter fallback fail-closed.
- Configurar `disable_signup=true` no Supabase para bloquear o bypass `/auth/v1/signup` após confirmar consumidores externos; manter login por email e confirmação do email.
- Provar em staging controlado: convite enviado/recebido; expirado/reuso; identidade duplicada confirmada/não confirmada; inserção de `public.users` falha; cleanup de tenant; usuário não verificado não entra; verificou e definiu senha; novo login; sessão de outro tenant não acessa dados; perda de SMTP gera falha recuperável.
- Avaliar política de provisionamento de créditos e expiração de tenants não ativados para mitigar acúmulo de trials órfãos. Atualmente a criação do tenant antecede aceitação da caixa postal.
- Não executar merge, deploy, ativação da flag, migrations ou alterações no Supabase sem revisão de segurança e autorização explícita por ambiente.

## Fontes primárias

- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- https://supabase.com/docs/guides/auth/redirect-urls
- https://vercel.com/docs/headers/request-headers
