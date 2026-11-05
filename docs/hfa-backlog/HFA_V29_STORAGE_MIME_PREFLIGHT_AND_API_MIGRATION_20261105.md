# HFA V29 — Preflight MIME e atualização segura do Storage

Data: 2026-11-05. Branch local: review/hfa-gemini-integration-20261105.

## Diagnóstico

A V27 verificava magic bytes, tamanho e extensão dos arquivos antes de criar o evento, mas não verificava se o bucket analysis-documents aceitava de fato cada MIME. A configuração real do bucket HFA foi lida somente para diagnóstico no Supabase: bucket privado, limite de 10 MiB por arquivo e MIME autorizados apenas application/pdf e DOCX. Um envio TXT/JPEG/PNG/WebP válido na aplicação podia criar o evento, mas falhar durante o upload, produzindo 503 e dados parcialmente registrados.

A migração local V27 propunha UPDATE direto em storage.buckets. As orientações oficiais atuais do Supabase recomendam evitar modificar o schema interno Storage via SQL e utilizar a Storage API. Fontes:
- https://supabase.com/docs/guides/storage/schema/design
- https://supabase.com/docs/reference/javascript/file-buckets-getbucket
- https://supabase.com/docs/reference/javascript/file-buckets-updatebucket

## Mudança de código

1. frontend/src/lib/event-document-persistence.ts:
   - Define seis MIME aprovados para HFA, bucket privado e limite exato de 10 MiB.
   - checkDocumentBucketPolicy rejeita bucket público, política MIME desconhecida/aberta e limite diferente.
   - assertStorageBucketSupportsSourceFiles usa storage.getBucket para validar o estado REAL antes de qualquer gravação.
   - Rejeita MIME não autorizado com HTTP 415 / STORAGE_MIME_NOT_ENABLED, sem evento criado.
   - Falha de leitura ou política inesperada retorna HTTP 503, sem evento criado.
   - Sem anexos, não consulta o Storage e mantém o fluxo textual existente.
2. frontend/src/app/api/events/route.ts:
   - Executa a verificação após validação dos bytes e antes de checagem de duplicidade, preflight IA, débito de crédito e INSERT em events.
   - Usa status e código de erro próprios; nenhuma entidade é criada quando o bucket não pode aceitar o formato.
3. Removida, somente da branch local, a migração SQL V27 de alteração direta da tabela interna:
   supabase/migrations/20261105185907_hfa_multifile_analysis_documents_mime.sql
   O documento histórico V27 recebeu nota de supersessão. Não houve aplicação remota dessa migração.
4. frontend/scripts/hfa-storage-mime-staging.ts:
   - Inspeciona por getBucket, com --check somente leitura.
   - Modo --apply utiliza exclusivamente storage.updateBucket (API oficial), preservando bucket privado e limite.
   - Requer HFA_ENVIRONMENT=staging, URL Supabase hospedada de projeto explícito, chave própria de staging, ref distinta da ref de produção conhecida e confirmação independente HFA_STORAGE_MIME_APPLY_APPROVED com valor exigido e --confirm-ref idêntico.
   - Compara configuração anterior (PDF/DOCX somente) ou final (seis MIME) e bloqueia drift.
   - Após eventual atualização, consulta novamente e só informa sucesso se o estado final foi observado.
   - Nunca imprime chaves, tokens nem metadados de usuários.
   - **Nenhum --apply foi executado; somente o comportamento offline foi simulado.**

## Testes

- Novo grupo V29: tests/hfa-audit/gemini-multifile/v29-storage-preflight.test.ts com 12 testes.
- Substituído teste V27 que exigia manipulação SQL do Storage por contrato que verifica a ausência da migração e uso da API oficial.
- O runner de multifile passa a executar cinco suítes; o core CI já chama esse runner, portanto inclui as verificações V29.
- Os testes são offline, com Storage/API simulados e injeção controlada de dependência.
- TypeScript: PASS, sem erros.
- Lint ESLint: 0 erros, 29 avisos.
- Build Next.js 16.4.5: PASS, com URLs e credenciais fictícias e flags Shadow OFF.
- Cinco suítes de upload múltiplo: PASS, contendo 12 testes novos V29.
- Quatro frentes Gemini: PASS nos seus respectivos contratos offline.
- Script CLI --check sem staging configurado: falha fechada com código de saída 3 e não executa conexão.
- Configuração do workflow Core CI: YAML válido; o runner multifile executa os testes V29.
- CI remoto do GitHub, autenticação com dois tenants e atualização real de bucket: NÃO EXECUTADOS.

## Uso futuro, apenas quando staging isolado estiver comprovado e autorizado

Fornecer manualmente as variáveis HFA_ENVIRONMENT, HFA_STAGING_SUPABASE_PROJECT_REF,
HFA_STAGING_SUPABASE_URL e HFA_STAGING_SUPABASE_SERVICE_ROLE_KEY apontando para um
Supabase de homologação exclusivo. Executar em primeiro lugar o comando read-only:

./frontend/node_modules/.bin/tsx frontend/scripts/hfa-storage-mime-staging.ts --check

Após verificar o projeto de staging, executar o modo --apply apenas com autorização
específica adicional e as duas confirmações exigidas pelo script. Reexecutar --check
e os testes de isolamento de dois tenants.

## Bloqueios de release

- Não há projeto Supabase HFA de staging independente identificado na conexão atual.
- A produção Vercel permanece vinculada ao repositório histórico, não ao desenvolvimento.
- O bucket real continua PDF/DOCX, sem promessa de habilitação de outros MIME.
- Segurança de Auth, RLS e concorrência de IA não foi validada com dois tenants reais.
- Nenhuma migração, política, objeto Storage, usuário, PR, merge ou deploy foi alterado remotamente.
- O portão científico SERA V04 permanece NOT_READY; resultado de teste sintético não é validação científica.

**Estado de V29:** correção local de pré-condição, proteção contra eventos parcialmente criados e migração preparada para procedimento controlado via API; release segue bloqueado.

## Regressão SERA determinística integral após o commit de código

A suíte scripts/run-sera-vnext-ci-regression.ts foi executada integralmente em
checkout inicialmente limpo, sem credenciais reais, no código V29 commitado:
251 casos no manifesto, 198 selecionados, 196 executados, 194 PASS,
0 FAIL, 0 TIMEOUT, 2 NOT_READY esperados e resultado CI_PASS.
A validação científica selada V04 permanece NOT_READY, sem alteração de
oráculos ou locks.

Quatro relatórios de tests/sera-vnext/engine-validation-v0/reports regenerados
pelo runner foram restaurados ao conteúdo exato do commit. O log de execução
fica somente no Mac autorizado em /private/tmp/hfa-v29-sera-regression.log.

Não houve mudança de código entre essa regressão e a inclusão desta nota
de evidência no documento técnico.
