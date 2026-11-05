# HFA — Consolidação local e segurança V22 (05/11/2026)

**Escopo:** trabalho de revisão isolado, sem push, merge na main, escrita em banco, mudanças em Vercel ou publicação.
**Repositório:** isaeldaumas/HFA, base origin/main = 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd.
**Branch:** review/hfa-gemini-integration-20261105.

## Worktrees e remotes

- Fetch de origem e tags em três remotes: origin e origin-hfa apontam para a mesma main 9168bea; source-hfa (legado) para 315eac1.
- 19 worktrees antigas e limpas, todas ancestrais de origin/main, foram removidas com git worktree remove (sem force). Commits e branches não foram eliminados.
- Dois registros Git administrativos inválidos foram retirados pelo git worktree prune, sem tocar worktrees vivas.
- A main limpa em /Users/filipedaumas/SAAS/HFA-integration-v1 foi atualizada por fast-forward de a0e711f para 9168bea; branch principal de AirTrust e demais worktrees de executores foram preservadas.
- O checkout representativo do deployment de produção cb13923b foi conservado para rastreabilidade de rollback.
- Nenhum push para GitHub ocorreu. O projeto Vercel systemhfa continua vinculado a system-hfa/HFA; este trabalho não altera esse vínculo.

## Consolidacao dos quatro agentes

Os quatro commits locais dos Gemini 1 (jornada), 2 (multifile), 4 (release) e 3 (segurança) foram cherry-picked com -x apenas na branch de revisão. Os agentes originais e suas branches permanecem intactos. Os testes relatados foram repetidos localmente; não equivalem a testes remotos de staging nem validação científica.

### VULN-03 — Correção local provisória

**Causa verificada:** o helper requireAdmin de tenant considerava plano Enterprise + role admin; várias rotas globalmente administrativas não restringiam resultados por tenant. Isso permitia a um admin cliente acessar dados globais em condições de autenticação normal.

**Mitigação V22:**
1. Predicado isPlatformAdminAuthorized em platform-admin-authority.ts, com allowlist explícita de auth.users.id e role admin autoritativo.
2. Novo requirePlatformAdmin em admin-auth.ts exige requireBearerUser (identidade validada e papel resolvido em public.users), além de identidade no ambiente de servidor HFA_PLATFORM_ADMIN_AUTH_USER_IDS; o plano comercial Enterprise não é requisito para operador da plataforma.
3. Nove rotas globais usam o novo guard: /api/admin/tenants, /api/admin/tenants/[id], /api/admin/payments/transactions, /api/admin/packages, /api/admin/packages/[id], /api/admin/stats, /api/admin/settings, /api/admin/settings/password-reset e /api/admin/ai/test.
4. Ausência de configuração, UUID inválido ou lista malformada causa HTTP 403 sem fallback a email, user_metadata, plano Enterprise ou body.
5. As rotas SERA tenant-scoped existentes continuam usando as autorizações específicas ao tenant.

**Bloqueio operacional:** HFA_PLATFORM_ADMIN_AUTH_USER_IDS deve ser configurada em ambiente protegido para identidades globais realmente autorizadas, antes de homologação e publicação. Não inserir IDs pessoais no Git. A restrição sem configuração retira acesso às nove rotas de todos os usuários; é uma decisão de segurança fail-closed, não um incidente oculto.

**Limitação:** os testes provam regras de programação e estrutura de rotas, não provam um cenário E2E autenticado em Supabase. A autorização global deve ser testada com identidades sintéticas e de operação de plataforma em staging protegido. Não implantar isoladamente sem planejamento de acesso administrativo.

### Target de staging

A verificação antiga aceitava URL com substring staging, por exemplo https://attacker.example/path/staging. A nova função isAllowedStagingTarget exige origem HTTP local exata ou origem HTTPS remota explicitamente permitida, rejeitando origens de produção e hosts confundíveis. Isso é teste offline, não um novo autorizador de tráfego remoto nem substituto da validação de identidade do projeto Vercel e do project ref Supabase.

## Pendências de risco

- **P0 Python tenant:** backend FastAPI ainda usa tenant_id a partir de user_metadata (controlável pelo usuário). Corrigir por ligação autoritativa ao banco ou desativar endpoint legado após análise de consumo.
- **P0 credenciais IA:** applyUserAiSettingsToEnv ainda escreve chaves em process.env global. A correção real exige resolver configurações por requisição e migrar os consumidores; modificar só o setter não resolve.
- **P1 exclusão:** tentativa de DELETE grava evento administrativo para eventId sem validar titularidade primeiro.
- **P1 upload:** o patch Gemini 2 recebe lotes, mas ainda exige teste remoto de persistência event_documents e garantia de que failures de inserção não sejam reportadas como sucesso.
- **Sem OCR real:** imagens anexadas permanecem com status de extração não verificada.
- **Staging/migrações:** preflight do ledger expirado; ambiente de homologação e dois tenants reais não foram verificados.
- **SERA:** bloqueio científico e gates da metodologia permanecem inalterados, sem V04 selado nem liberação de códigos.

## Verificações

- Correção de guard global: tests/hfa-audit/gemini-tenancy-security/test-platform-admin-remediation.ts.
- Reprodução da vulnerabilidade histórica agora registra VULN-03 como mitigada no cenário local, VULN-01 e VULN-02 seguem reproduzidas e NÃO corrigidas.
- Staging alvo: tests/hfa-audit/gemini-release-readiness/staging-smoke-synthetic-plan.ts e allowlisted-staging-target.ts.
- Core CI ganhou gate para os dois testes.
- Bench local dos quatro agentes, TypeScript e YAML verificados. Registros definitivos de PASS devem corresponder à execução real no checkout consolidado.

**Estado:** candidate review only; NÃO publicado, NÃO mergeado em main, sem permissões para produção e sem validar o método científico.

## Resultado local confirmado nesta revisão

- Suite jornada Gemini1: 56 PASS / 0 FAIL (harness sintético).
- Suite upload Gemini2: 3 blocos concluídos / 0 FAIL (contratos e extração local).
- Suite isolamento Gemini3: 38 PASS / 0 FAIL, incluindo VULN-03 mitigada no código local, e VULN-01/VULN-02 ainda reproduzidas.
- Suite release Gemini4: 3 PASS / 0 FAIL (inventário e plano offline, não staging real).
- Teste adicional de autorização global: PASS, com 9 rotas exigindo requirePlatformAdmin.
- Teste adicional de staging allowlist: PASS, incluindo rejeição de host disfarçado.
- TypeScript: PASS; ESLint: 0 erros e 30 warnings reportados.
- Build Next.js com dependências locais instaladas: PASS no Node 26 e variáveis placeholder, Shadow OFF. A CI oficial permanece configurada para Node 22; não foi executada nessa branch sem publicação.
- Nenhuma alteração de pipeline foi executada remotamente; apenas o arquivo de workflow local foi modificado.

Não houve merge na main nem mudança de produção. Release exige autorização específica e revalidação das demais P0.
