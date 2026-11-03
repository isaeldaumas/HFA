# HFA — Proteção do cadastro público (WAF)

**Aplicação verificada em 03/11/2026** no projeto Vercel `prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa`, equipe `team_3NqdL34wnYaXdPexDmRC7xFH`.

## Regra ativa
- Configuração WAF: `waf_2NhfKhe1ChpP`, versão ativa 2.
- Regra: `rule_hfa_public_signup_10_requests_min_ip_XfsblA`.
- Condições (AND): path equals `/api/auth/register`; method equals `POST`.
- Janela fixa, chave IP, 10 solicitações por 60 segundos, excedentes HTTP 429.
- Nenhuma regra para GET /register, GET /login ou demais APIs.
- Bot Protection Managed Ruleset ativado na mesma configuração em **modo Log**: identifica suspeita de automação, mas não desafia ou bloqueia requisições. Não é controle anti-bot de enforcement.
- Estado armazenado na Vercel, não em migrations SQL; este documento é registro de governança.

## Evidência e limitações
- Onze POSTs com JSON inválido `{}` produziram dez HTTP 400 e depois HTTP 429; nenhuma conta foi criada.
- GET /register retornou 200; POST /api/events com JWT inválido retornou 401.
- Regra protege contra excesso por IP, não ataques distribuídos entre IPs; NAT empresarial compartilha a cota. A contagem pode variar por região da borda.
- A existência de rate limiting não significa que CAPTCHA e posse de e-mail foram verificados.

## Operação e reversão
Consultar Vercel > projeto systemhfa > Firewall > Custom Rules e o log de auditoria.
Para falsos positivos comprovados, desativar somente a regra acima após ler o estado atualizado; não sobrescrever outras regras.
Monitorar bloqueios 429, tentativas por IP e impacto em redes corporativas; modificar limites após revisão documentada.

## Pendências da issue #106
- O cadastro ainda executa `admin.createUser({ email_confirm: true })` sem comprovar posse do e-mail.
- Não alterar diretamente para `email_confirm: false`: `admin.createUser` não envia confirmação de e-mail e, sem SMTP de produção e fluxo de recuperação, isso bloquearia o acesso legítimo.
- O SMTP padrão do Supabase não é apto para envio geral em produção; a confirmação exige infraestrutura de e-mail configurada e testada.
- Faltam desafio antibot, controles por e-mail/identificador e homologação real autenticada com tenants sintéticos.

Fonte oficial Vercel: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
Fonte oficial Supabase: https://supabase.com/docs/guides/auth/auth-smtp
