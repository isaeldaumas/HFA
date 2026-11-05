# HFA V24 — cadastro legado, RBAC e segurança HTTP do FastAPI (05/11/2026)

**Escopo:** branch local review/hfa-gemini-integration-20261105. Sem push, merge, deploy, gravação remota, modificação metodológica SERA ou execução de V04.

## 1. Cadastro Python /auth/register

**Achados:** antes, uma correspondência de e-mail autoafirmado era suficiente para o plano Enterprise com créditos ilimitados; o tenant era criado antes de conferir a operação Auth sign_up; um usuário obfuscado de cadastro já existente podia ser tratado como novo; o public.users.id era independente de auth.users.id.

**Correções V24:** todo cadastro público (incluindo OAuth bootstrap) cria plano free e cinco créditos; Enterprise exige concessão administrativa separada. Valida nome e slug antes de tentar cadastrar no Auth. Verifica duplicidade em public.users. Chama Supabase Auth e valida ID, e-mail e identities não vazias antes de criar tenant. Grava public.users.id e public.users.auth_user_id iguais ao Auth ID retornado, sem metadados editáveis como autorização. Falha de persistência retorna 503 em vez de falsa confirmação. GET /auth/me separa papel admin do plano Enterprise, sem conceder administração global.

**Limitação:** signup Auth e inserções SQL ainda não são transação única. Falhas depois de sign_up podem deixar Auth sem perfil público; falhas depois da criação de tenant podem deixar tenant órfão. Não deletar usuário de Auth como compensação improvisada. Exigem mecanismo seguro de reconciliação/atomicidade e testes reais autorizados.

## 2. Autorização das edições e escopo por tenant

O esquema lido do projeto Supabase HFA confirmou que o enum public.user_role só possui admin, analyst e viewer. Atualizações de ações corretivas e recálculo/reversão legados passam a exigir admin ou analyst, negando viewer antes de consultar o banco. Gravações e leituras pós-atualização de análises legadas sempre incluem tenant_id. Ações inexistentes ou pertencentes a outra empresa retornam 404. A reversão verifica existência da análise.

Os endpoints de recálculo legado Python ainda existem; o Next.js desativou sua contraparte antiga. Há uma decisão pendente: desativar o backend Python ou migrar cuidadosamente os poucos consumidores restantes. Não reativar processamento científico legado.

## 3. CORS

O antigo padrão ALLOWED_ORIGIN_REGEX aceitava qualquer domínio em *.vercel.app, mesmo sem relação com HFA, incluindo preflights com credenciais. O padrão agora é None; apenas origens explicitamente cadastradas via ALLOWED_ORIGINS são admitidas. No teste HTTP local, origem de outro projeto Vercel foi recusada e localhost:3000 foi aceita.

Configurar as origens de staging e produção pelo operador antes do rollout; do contrário, clientes legítimos podem ser bloqueados. Nunca usar wildcard amplo para resolver o problema.

## 4. Tabela opcional de configurações de IA

Consulta read-only ao banco HFA confirmou public.ai_settings, porém public.system_settings não aparece no esquema público. O resolvedor V23 agora tolera somente os códigos de ausência de tabela PGRST205 e 42P01, preservando o isolamento por requisição e usando alternativas de ambiente/usuário sem copiar chaves de outro request. O teste offline de concorrência de IA foi estendido para esse cenário.

## 5. Supabase, somente leitura

No projeto HFA ativo, as colunas auth_user_id, tenant_id e is_active estão presentes em public.users, e is_active em public.tenants. Existem índices únicos para users.auth_user_id (parcial), users.email, tenants.slug e ai_settings.user_id. Isso comprova parte da compatibilidade do esquema, mas não a separação formal staging/produção.

O security advisor apontou:
- WARN: proteção contra senhas vazadas desligada. Referência https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . Exige autorização específica para mudar política de login.
- INFO: RLS ativo e sem políticas em cinco tabelas: analyses_backup_pt_en, event_duplicate_links, sera_document_uploads, sera_taxonomy_entries e sera_vnext_shadow_results. Isso pode ser deliberado para bloquear acesso direto; não criar GRANT nem políticas sem conhecer os consumidores. Referência https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

Nenhum dado pessoal, segredo, SQL de escrita ou configuração remota foi consultado ou alterado.

## 6. Evidências executadas

Python 3.12 em ambiente virtual isolado, com FastAPI 0.111.0, Supabase Python 2.4.6, httpx 0.27.0 e email-validator:
- 13 testes de identidade autoritativa PASS;
- 18 testes dos próprios handlers de cadastro e RBAC com banco sintético PASS;
- 9 testes HTTP reais usando FastAPI TestClient, com Auth e DB sintéticos, PASS;
- total de 40 testes Python PASS; contrato TypeScript de fronteira Python PASS; TypeScript completo PASS.
- Core CI foi atualizado localmente para rodar a suíte HTTP depois de instalar as dependências de teste; CI remoto ainda NÃO executado nesta branch.
- A suíte HTTP usa dependências reais FastAPI, mas contorna tokens reais pelo mecanismo de override do teste. Não comprova Supabase real, isolamento de duas organizações numa infraestrutura de staging ou disponibilidade de production.

**Estado:** candidato a revisão local, sem deploy; V04 e os locks científicos SERA permanecem fechados.
