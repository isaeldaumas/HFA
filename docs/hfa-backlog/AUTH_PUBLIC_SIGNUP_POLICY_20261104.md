# HFA — Auditoria da superfície pública do Supabase Auth

**Data da observação:** 04/11/2026
**Projeto:** Supabase HFA `vbdpweliprcsktyxodss`
**Acompanhamento:** GitHub issue #106
**Natureza:** verificação somente de leitura; nenhuma conta ou tenant criado

## Diagnóstico observado na configuração real

A consulta pública `GET /auth/v1/settings` com a chave *publishable/anon* atualmente devolve:

| Chave | Valor observado | Interpretação |
| --- | --- | --- |
| `disable_signup` | `false` | A API direta de signup do Supabase continua habilitada |
| `external.email` | `true` | Login por e-mail continua habilitado |
| `mailer_autoconfirm` | `false` | Signup direto exige confirmação de e-mail (não prova que SMTP público está operacional) |
| outros provedores OAuth | nenhum habilitado | Nenhum fluxo OAuth público identificado no snapshot |

O limite WAF **10/IP/60 s** do HFA protege somente `POST /api/auth/register`
no domínio da Vercel. Solicitações diretas à API `https://vbdpweliprcsktyxodss.supabase.co/auth/v1/signup`
não atravessam esse limite. A validação por e-mail restringe o uso das identidades criadas diretamente,
mas não equivale a desabilitar a superfície de entrada. Não foi executado cadastro
direto de teste — portanto **não está comprovada exploração ou acesso a dados entre tenants**.

## Correção operacional recomendada

Antes de alterar a configuração, confirmar que nenhum outro consumidor externo
usa `auth.signUp()` diretamente, incluindo integrações não versionadas.

1. Supabase Dashboard > projeto HFA > **Authentication > Sign In / Providers**.
2. Desativar **Allow new users to sign up**, isto é, aplicar somente
   `disable_signup=true` na configuração geral do Auth.
3. **Manter o provedor Email habilitado** (`external.email=true`), preservando
   o login dos usuários existentes. **Não** alterar a chave
   `external_email_enabled` para `false`.
4. **Manter a confirmação de e-mail do provedor habilitada**
   (`mailer_autoconfirm=false`); isso não corrige o
   `admin.createUser({email_confirm:true})` do HFA.
5. Reexecutar a auditoria `npm run audit:auth:policy` usando apenas
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do HFA.
   Estado esperado: `disable_signup=true`, `external.email=true`,
   `mailer_autoconfirm=false`, sem expor nenhuma chave.
6. Validar **login existente com credenciais de teste autorizadas** e
   cadastro administrativo do HFA em ambiente controlado. Não criar usuários
   reais para testar sem autorização específica e plano de limpeza.
7. Caso haja regressão de login, reverter **somente** `disable_signup` e
   investigar; nunca desligar o provedor Email durante a reversão.

### Por que não usar `supabase config push`?

O CLI pode mapear incorretamente `[auth.email].enable_signup=false` para
`external_email_enabled=false`, quebrando também o login por senha.
Use o controle geral de novos cadastros no Dashboard ou, com credencial de
gerência autorizada, um PATCH restrito ao campo `disable_signup` — nunca
substituir toda a configuração de Auth.

Nesta rodada, a leitura autenticada da configuração de gerenciamento retornou
HTTP 401 com a credencial local disponível. **Nenhum PATCH foi executado**.
O comando de auditoria adicionado ao repositório usa somente a API pública
GET e, portanto, funciona sem acesso de gerência; sua saída identifica falhas
sem imprimir chaves ou respostas de fornecedores.

## Código e critérios de aceite

- Ferramenta: `frontend/tools/audit-supabase-auth-policy.mjs`
- Execução manual: `cd frontend && npm run audit:auth:policy`
- Testes determinísticos: `frontend/tests/auth-public-signup-policy.test.mjs`
- Core CI: contratos sintéticos verificam desvio `disable_signup`,
  provedor de e-mail, confirmação, proteção de segredo e restrição de domínio
- **A auditoria real deve permanecer com status de falha até a configuração ser corrigida.**
  Não marcar a issue #106 como concluída por causa da ferramenta.

## Pendência separada: posse de e-mail no cadastro do HFA

O cadastro da aplicação usa `admin.auth.admin.createUser({email_confirm:true})`,
de modo que marca e-mails como confirmados sem prova de posse. Desabilitar signup
direto reduz abuso, **mas não corrige essa falha**. A solução requer um fluxo
de confirmação e recuperação confiável, templates, URLs permitidas e um
provedor de SMTP ou hook de envio testado. O serviço SMTP padrão do Supabase
é restrito e não atende livremente e-mails externos.

Fontes oficiais:
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/reference/api/v1-update-auth-service-config
- https://supabase.com/docs/guides/auth/auth-smtp
- https://github.com/supabase/cli/issues/7055
