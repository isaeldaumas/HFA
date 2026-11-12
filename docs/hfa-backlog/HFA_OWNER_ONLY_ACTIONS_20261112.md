# HFA — Fronteira entre execução autônoma e ações exclusivas do proprietário
Atualizado em 12/11/2026. Produção: https://systemhfa.vercel.app.
Supabase: vbdpweliprcsktyxodss. Sem staging.

## Critério de encerramento
Merge, build, HTTP 200, regressão sintética e deployment READY são provas
técnicas, mas não provam email recebido, identidade validada, isolamento
cross-tenant autenticado, valor científico ou funcionamento real de OCR.

## O agente pode executar sozinho, com as permissões atuais
- Engenharia: localizar e corrigir falhas; testar contratos, regressões, CI,
  builds, infraestrutura de app e publicar em produção somente o SHA aprovado.
- Banco: ler o schema, grants, RLS, políticas e migrações, executar transações
  de leitura e rollback, reconciliar o ledger. Não adulterar dados reais.
- Cadastro: preparar código de convites, limite distribuído por email, WAF,
  Turnstile, callbacks, recuperação, proteção contra bypass. Cadastro continua
  desligado até confirmação operacional.
- Anexos: validar assinatura/MIME/tamanho, persistência por evento e tenant,
  falhas compensatórias, deleção, documentação e preparação técnica de OCR;
  não inventar extração ou evidência causal.
- SERA: preparar protocolo de amostragem, kits de cegamento, formulários,
  organização de avaliadores e planilhas de análise descritiva. Não criar
  julgamentos humanos falsos nem autorizar o motor por conta própria.
- Operação: testar endpoints não autenticados e comportamento fail-closed,
  verificar logs, auditorias e documentação e executar rollback autorizado.

## Dependências reais que precisam de ação humana ou acesso externo

| Prioridade | Menor ação externa necessária | O que o agente consegue fazer depois | Evidência exigida |
| --- | --- | --- | --- |
| P0 — email | Escolher/validar domínio remetente e provedor de email transacional com SPF, DKIM, DMARC e SMTP funcional. O acesso deve ser pelo painel/conector, jamais por segredo colado em issue. | Configurar produção, executar recuperação e convite reais com caixa controlada e testar callback/TTL/uso único. | Mensagem efetivamente recebida e fluxo confirmado. |
| P0 — antibot | Criar site Cloudflare Turnstile para systemhfa.vercel.app, conectar acesso ao provedor ou colocar chaves pública/secreta no gerenciador Vercel. | Rodar testes de desafio, falhas, proteção contra abuso e WAF e considerar abertura de cadastro. | Legítimo passa; tentativa automatizada/bypass falha. |
| P0 — E2E dois tenants | Ter duas contas e dois eventos exclusivamente sintéticos em empresas distintas, com dois JWT efêmeros (sem dados de clientes). A autorização para uso em produção está concedida, mas sem fixtures o teste não é executável. | Executar seis GETs em produção (2 listagens, 2 próprios HTTP 200, 2 cruzados HTTP 404), revogar tokens e registrar resultado sem expor dados. | 6 verificações GET real, sem writes, após todos os pré-requisitos. |
| P0 — validação SERA | Fornecer casos reais autorizados e lacrados, avaliadores humanos independentes e critérios de adjudicação/decisão autoral. | Distribuir casos cegos, compilar respostas, medir concordância, preparar análise de erros e revisão. | Dois pareceres independentes, adjudicação auditada e aprovação formal do autor. |
| P1 — Shadow | Autor autoriza especificamente observação, duração, critérios de saída e rollback após gate humano. | Executar período observado, alertas, comparação e rollback. | Gate científico concluído, evidência operacional e autorização explícita. |
| P2 — proteção de senhas vazadas | Definir se recurso gerenciado Supabase Pro justifica custo ou aprovar alternativa equivalente. | Habilitar/validar proteção correspondente. | Advisor resolvido ou alternativa testada. |

## Intertravamentos que o agente não deve contornar
1. Cadastro direto do Supabase segue desativado; convite HFA não pode ser ligado
   sem email e Turnstile. Não publicar chave service-role no frontend.
2. Shadow permanece OFF, SERA naturalístico NOT_READY, taxonomia e P/O/A
   protegidos, autorização científica específica pendente.
3. Não fabricar contas, eventos, tokens ou avaliações de clientes para suprir
   ausência de evidência real.
4. Preservar as alterações sujas do checkout original e usar worktrees limpas.
5. Testes de cross-tenant geram PASS apenas com duas credenciais sintéticas
   reais, nunca somente com simulação.

## Progresso técnico adiantado em 12/11/2026
O teste read-only de isolamento entre empresas foi preparado para aceitar
produção exclusivamente com aprovação dupla e host exato permitido. Em código
são somente seis GETs, sem mutações e sem logging de tokens ou de narrativas.
Há 13 testes locais adversariais de contrato, mas eles são MOCKS.
No Supabase real, um JWT sintético não vinculado não enxerga linhas nas
tabelas users, events, event_documents e sera_vnext_analyses, com rollback
e nenhuma gravação. Isso não substitui dois JWT reais.

Status do HFA: aplicação técnica em produção, mas cadastro NÃO_READY,
homologação HTTP autenticada cross-tenant NOT_RUN e validação científica
naturalística NOT_READY. Nenhum desses bloqueios pode ser encerrado só com CI.
