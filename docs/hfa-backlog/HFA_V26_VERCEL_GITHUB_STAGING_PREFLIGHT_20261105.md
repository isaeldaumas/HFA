# HFA — V26: Vercel/GitHub, produção e pré-requisitos de staging (05/11/2026)

**Escopo:** investigação de leitura e implementação de preflight offline na branch local review/hfa-gemini-integration-20261105. Nenhum push, merge, deployment, configuração remota, migração Supabase ou acesso a registros pessoais.

## Fontes verificadas

1. Repositório Git local e origem: isaeldaumas/HFA, branch main remota no SHA 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd (verificado por git ls-remote).
2. Projeto Vercel systemhfa, ID prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa: Git link system-hfa/HFA, productionBranch main, rootDirectory frontend, Node.js 24.x.
3. Alias HTTPS systemhfa.vercel.app aponta para o deployment dpl_CxLqEKX5wxKEbQnVzywXAiRHGdpZ, READY em production, associado ao SHA cb13923b0009bdce1c13b1403516a820c425a002.
4. O segundo projeto Vercel frontend, ID prj_8oRx3BxsuvQfGIVOsYEWkQCrV7AJ, não apresenta link Git e os dois deployments listados estavam em estado ERROR; não deve ser presumido como staging.
5. Na consulta ao projeto principal foram identificados nove deployments preview, todos antigos; o mais recente foi criado em 2026-10-15T00:25:46.513Z (14/10/2026 à noite no horário de Brasília). Preview histórico não demonstra staging contínuo com banco e identidades independentes.
6. PR científica #121 permanece aberta em DRAFT, HEAD ba6039d710defb0e9cad8abdec3065c31726a5a9. Não foi alterada.

As leituras dos projetos/deployments foram executadas pelo CLI Vercel autenticado no Mac. O conector ChatGPT/Vercel ainda responde HTTP 403 de escopo, portanto não confundir autorização local do CLI com autorização disponível no conector.

## Diagnóstico e severidade operacional

- BLOQUEADO: repositório fonte de deployment (system-hfa/HFA) diferente do repositório atual de desenvolvimento (isaeldaumas/HFA).
- BLOQUEADO: SHA implantado distinto da main do desenvolvimento. Isso não prova falha; a defasagem pode ser uma escolha de governança. Não sincronizar automaticamente.
- BLOQUEADO: HFA_PLATFORM_ADMIN_AUTH_USER_IDS não consta nas 16 variáveis cadastradas no projeto principal. A mitigação V22 exige essa allowlist para permitir as nove rotas administrativas globais; sem configuração, essas rotas negam acesso com 403.
- NÃO VERIFICADO: staging isolado com dois tenants sintéticos e RLS, banco exclusivo, URL validada e QA repetível. Há variáveis Supabase com alvo production e preview, mas não foi consultado nem comparado nenhum valor secreto; a existência dessas chaves não comprova bancos separados.
- PASS: deployment real que responde pelo alias de produção tem estado READY e identidade compatível com o projeto systemhfa.
- BLOQUEADO POR GOVERNANÇA: V04 selado e classificação científica independente; nenhum teste de deploy altera esse estado.

## Controle automatizado entregue

Script de leitura: scripts/hfa-vercel-github-drift-readonly.mjs.

Comando: node scripts/hfa-vercel-github-drift-readonly.mjs --live

Exige Git e Vercel CLI autenticado; executa exclusivamente consultas de leitura aos metadados Vercel, git ls-remote e inspeção do alias. Não lê ou imprime valores de variáveis de ambiente, tokens, usuários ou resultados científicos.

Códigos de saída:
- 0: cinco controles de configuração passaram; ainda assim não significa autorização de merge, deploy ou validação científica.
- 2: pelo menos um controle BLOQUEADO/NOT_VERIFIED; operação de release não permitida.
- 3: fonte de leitura ou identidade não pôde ser verificada; operação de release não permitida.

Contratos offline: tests/hfa-audit/gemini-release-readiness/vercel-github-drift-contract.test.mjs; oito testes adversariais passaram. Core CI pode executá-los sem exigir credenciais externas. A auditoria real retornou código 2 (BLOCKED), conforme esperado.

## Sequência segura de homologação proposta, não executada

1. Confirmar a estratégia de repositório: manter system-hfa/HFA como produção ou migrar formalmente para isaeldaumas/HFA. Não trocar vínculo Git sem avaliar gatilhos automáticos de deploy e branches protegidas.
2. Com autorização específica para criar infraestrutura, preparar staging separado, com projeto Vercel ou ambiente protegido e banco Supabase próprio; não reutilizar credenciais e contas reais de produção.
3. Configurar apenas segredos no provedor, por administrador autorizado, e confirmar a origem exata, projeto, banco e flags Shadow OFF. Não exibir segredos em logs de CI.
4. Executar testes reais com dois tenants sintéticos, incluindo leitura cruzada, negação de gravação, cadastro, anexos, reembolso, reanálise somente deterministic engine e concorrência de credenciais IA.
5. Revisar o executor SERA llm.ts (arquivo protegido), as decisões de autoria do CAL-07 e a validade dos oráculos antes de integração da mudança. Não abrir V04 por iniciativa automática.
6. Fazer PR normal da branch de integração somente com autorização para publicação no GitHub. Exigir revisão humana, CI e evidências; nunca promover direto de um checkout local. Deploy de produção requer autorização específica separada.

**Estado:** a V25 está somente no commit f90552d local. O preflight V26 apenas verifica e registra bloqueios, sem liberar qualquer etapa.
