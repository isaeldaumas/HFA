# HFA — Recuperação de senha: envio e homologação

**Data:** 04/11/2026 · **Issue:** #106
**Estado:** código preparado; entrega real de email não homologada

## Correção implementada

- O botão administrativo não usa mais o método de geração de link sem envio. Agora solicita recuperação pelo Supabase Auth.
- Somente administradores enterprise autenticados podem usar o endpoint administrativo, e o email de destino é carregado exclusivamente da configuração do servidor. Divergência entre formulário e configuração resulta em HTTP 409.
- A resposta indica pedido aceito pelo serviço, mas nunca afirma recebimento da mensagem. Nenhum token, action_link ou senha é retornado ou registrado.
- O login oferece uma página pública de solicitação, com resposta neutra quanto à existência da conta, e uma página para definir nova senha mediante contexto de recuperação.
- O redirecionamento administrativo usa a origem HTTPS de NEXT_PUBLIC_SITE_URL, sem aceitar destino arbitrário passado pelo navegador.
- Não houve alteração de dados reais, configuração global do Supabase, credenciais, migrations ou flags SERA.

## Pré-requisitos de homologação, não executados

1. Configurar serviço de entrega de emails do Supabase Auth (SMTP ou integração equivalente), com remetente e destinatários de teste autorizados. O serviço padrão tem restrições; resposta da API não comprova entrega.
2. Configurar NEXT_PUBLIC_SITE_URL e incluir exatamente a URL /update-password no Supabase Dashboard > Authentication > URL Configuration > Redirect URLs. Evitar wildcard abrangente para produção.
3. Verificar template de recuperação, expiração e revogação do link sem armazenar tokens em logs.
4. Com uma conta de teste autorizada, validar: recebimento real da mensagem, ativação do link, troca da senha, rejeição da senha antiga, novo login, falha de SMTP, limitação de frequência, link expirado e proteção contra enumeração.
5. Só então autorizar merge, deploy e conclusão operacional da recuperação de senha.

## Testes automatizados

Executar em frontend: node --import tsx --test tests/password-recovery-delivery.test.ts

Os 11 cenários cobrem autorização, redirecionamentos, validação de configuração, origem do email, chamadas simuladas à API de recuperação, falha de provedor e ausência de vazamentos. São testes determinísticos sem e-mails reais; não equivalem a homologação de entrega.

## Bloqueios ainda abertos na issue #106

- Desativar o signup direto na configuração geral Supabase (disable_signup=true), preservando o provedor Email para login. Exige acesso administrativo autorizado.
- O cadastro do HFA ainda chama admin.createUser com email_confirm=true, sem prova de posse. Deve existir decisão de produto, confirmação por email e validação fim a fim antes de alterar o fluxo de inscrição.
- Rate limiting distribuído, anti-bot e proteção contra senhas vazadas não são resolvidos por esta PR.
- A homologação autenticada entre dois tenants (PR #117) permanece pendente por falta de fixtures e credenciais de teste autorizadas.
- Gates #13–#15 sem modificação: shadow OFF; validação naturalística NOT_READY; decisão humana pendente.

## Documentação oficial

- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
