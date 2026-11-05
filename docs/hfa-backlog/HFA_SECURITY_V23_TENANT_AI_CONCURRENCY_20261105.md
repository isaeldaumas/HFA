# HFA — Segurança V23: tenant autoritativo Python, IA por requisição, auditoria de hard delete

**Data:** 2026-11-05. **Branch:** review/hfa-gemini-integration-20261105. **Status:** revisão local isolada, sem push, merge, deploy, operação remota de dados, substituição de fonte de metodologia ou validação científica.

## Contexto verificável

A V22 integrou localmente os quatro agentes Gemini e mitigou a confusão entre administrador Enterprise do cliente e administrador global da plataforma. Esta V23 mitiga três outros riscos apontados pela suíte Gemini 3:

- P0 — backend Python resolvendo tenant por user_metadata, atributo editável pelo usuário;
- P0 — credenciais e fornecedor de IA aplicados via process.env mutável e compartilhado;
- P1 — DELETE proibido mas com possível gravação de event_deletion_events com eventId de outra empresa antes de verificar titularidade.

As alterações são exclusivamente de segurança/infraestrutura. Nenhuma nova regra da árvore determinística de Percepção, Objetivo e Ação, oráculo, código científico, caso selado ou lock de validação foi modificado.

## P0 — backend Python

Foi criado backend/app/api/authoritative_user.py, com resolução de auth.users.id já autenticado por Supabase Auth contra public.users (colunas id, auth_user_id, tenant_id, role, is_active e email). A prioridade é vínculo direto por ID, seguido de auth_user_id explícito; fallback por email somente para associação LEGACY_CONFIRMED_EMAIL inequívoca e confirmada, sem outro vínculo conflitante. O tenant precisa existir e estar ativo. Erros DB retornam indisponibilidade (503), ausência/conflito/inatividade falham fechados (403).

A dependência get_authorized_user em backend/app/api/deps.py substitui leituras de user_metadata nos endpoints de eventos, análises, ações e créditos. GET de flows passa a filtrar tenant_id. A criação de evento usa publicUserId vinculado em banco, sem criar usuário administrativo a partir de role client-side. /auth/me passa a usar papel DB. /auth/oauth/bootstrap passa a ignorar tenant_id/role em user_metadata e recusa contas existentes ambíguas; novos tenants exigem email confirmado. O cadastro legado /auth/register ainda exige revisão transacional: pode criar tenant antes da conclusão do signup e usa um fluxo diferente do Next.js.

**Compatibilidade:** depende da migração de public.users.auth_user_id e de public.tenants.is_active na implantação alvo. Não executar rollout sem verificar esquema e autenticação em staging. A consulta falha fechada se a estrutura esperada estiver ausente.

**Testes:** 13 contratos Python com dublês de Supabase e teste de inspeção das rotas TS. Sem instalação de dependências FastAPI reais ou chamadas a Supabase remoto; runtime de FastAPI e DB ainda não homologados.

## P0 — IA e isolamento em chamadas concorrentes

Foi eliminado o módulo apply-user-ai-settings-to-env.ts e substituído por:
- ai-request-scope.ts: AsyncLocalStorage; snapshots imutáveis por contexto com provider, models e apiKeys;
- user-ai-settings.ts: lê preferências gerais e a linha de ai_settings vinculada ao ID autenticado; descriptografa a chave individual; retorna configuração explícita sem alterar process.env; configuração inválida/indisponível nega execução;
- llm.ts: callAi, getActiveProvider, getModelName, requireApiKey, callGoogle e assertLlmEnvConfigured consultam o escopo se presente. **Escopo ativo nunca usa fallback direto para chaves globais no LLM.** Fallback global fica resolvido pelo configurador de requisição, que pode usar credenciais de operação declaradas, não outra requisição;
- quatro rotas atualizadas: POST /api/events (somente hfa), POST /api/analyze, POST /api/org/ai-insight, POST /api/events/[eventId]/reanalyze-vnext (somente execução semântica).

A reanálise engine-only continua sem exigência de API/LLM. Os testes test-ai-request-scope-trial-001.ts intercalam duas operações assíncronas com provedores, modelos e chaves sintéticos distintos, validam que não há vazamento entre tenants nem mutação em process.env e comprovam fail-closed se a configuração do banco falhar.

**Limitações:** testes de concorrência com mocks não substituem duas requisições HTTP concorrentes reais. Alguns scripts legados de testes SERA utilizam configuração global fora de rotas de usuário; não devem ser expostos como endpoints multi-tenant. O componente semântico mantém os locks científicos vigentes.

## P1 — DELETE e auditoria de negação

A rota DELETE /api/events/[eventId] exige existência e titularidade do evento via filtro .eq('tenant_id',user.tenantId) ANTES de writeCriticalAuditLog ou inserção em event_deletion_events. IDs alheios ou inexistentes recebem a mesma resposta 404 e não geram vínculo de ciclo de vida com objeto de outra empresa. A proibição de hard delete de eventos próprios continua 409, com registro de auditoria.

## Gates reais e problema da verificação de arquivos protegidos

Foi iniciada a regressão SERA determinística completa enquanto os arquivos estavam modificados e ainda **não commitados**. Resultado:

- 251 manifestados; 198 selecionados; 196 executados; **185 PASS / 9 FAIL / 2 NOT_READY / 0 TIMEOUT**; CI_FAIL.
- As nove falhas listam diretamente alteração de arquivos protegidos (frontend/src/lib/sera/llm.ts e frontend/src/app/api/org/ai-insight/route.ts). Não representam divergências da classificação naturalística nos casos executados.
- Os gates em questão verificam a saída de git diff --name-only, isto é, essencialmente mudanças ainda não commitadas. Isso deve ser tratado como uma limitação da detecção de delta e não como uma autorização metodológica automática após commit.
- **É proibido alterar hashes, fixtures, oráculos, metodologia, manifesto ou locks de validação apenas para forçar CI_PASS.**
- Qualquer PR futura que altere llm.ts (arquivo protegido) deve indicar explicitamente o delta de segurança, os efeitos esperados sobre a execução do SERA e receber revisão humana de governança antes da promoção. Um green check de checkout limpo não vale como validação científica nem como permissão para os casos V04 selados.

Os relatórios de teste gerados em tests/sera-vnext/engine-validation-v0/reports foram restaurados após a execução, sem versionar diferenças de relatórios. A única fonte desta nota é o runner local (logs temporários, não disponibilizados via sandbox).

## Testes restantes antes de integração

1. Build Next.js e lint do checkout V23 com flags Shadow OFF e variáveis placeholder;
2. Rodar os contratos de segurança junto às suítes Gemini1, Gemini2, Gemini3, Gemini4;
3. Verificar os nove gates de integridade com checkout limpo depois do commit local, documentando suas limitações;
4. Staging: esquema autoritativo, autenticação two-tenant E2E, operações concorrentes de IA, protocolo de credenciais, dados de usuários sintéticos, e audit DELETE. **Não executar produção**;
5. Avaliação formal de mudanças no arquivo protegido llm.ts, sem promover o motor científico.

**Sem autorizações para push, merge, deploy, alterações remotas de usuários, migrações ou V04.**
