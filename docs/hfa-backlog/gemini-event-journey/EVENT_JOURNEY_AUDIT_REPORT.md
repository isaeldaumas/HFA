# HFA — Relatório de Auditoria Executável da Jornada Mínima de Eventos
**Agente Executor:** AGENTE GEMINI 1 (Conversa 1)  
**Data:** 05/11/2026  
**Repositório:** `isaeldaumas/HFA`  
**Branch Exclusiva:** `gemini/hfa-event-journey-qa-20261105`  
**Base Commit SHA:** `9168beab5b2bcd7dcc060e4bdd221b939b4e78dd`  
**Worktree:** `/private/tmp/hfa-gemini-event-journey-qa-20261105`  

---

## 1. Sumário Executivo

Esta auditoria técnica executável foi conduzida de forma autônoma e rigorosa pelo **AGENTE GEMINI 1** para validar o fluxo ponta a ponta da jornada mínima de registro e análise no HFA:
1. **Preenchimento dos dados do evento** (campos obrigatórios, opcionais e validações);
2. **Informação da fonte e ingestão documental** (PDF, DOCX, tipos inválidos, detecção MIME/magic bytes, rate limit e arquivos vazios);
3. **Extração de texto** (extração real de arquivos legítimos, rejeição de PDFs sem texto/apenas imagem, corrompidos ou com senha);
4. **Persistência fiel e deduplicação** (rejeição de duplicatas sem justificativa com HTTP 409, override auditado com >= 20 caracteres, consistência de créditos);
5. **Isolamento de tenant** (impossibilidade de visualização, listagem, injeção ou reanálise cross-organization entre Tenant Alpha e Tenant Beta);
6. **Resiliência a falhas parciais** (preflight de IA sem saldo aborta antes de persistir; falha do motor SERA pós-criação marca `failed` e estorna créditos; tolerância à falha de anexo; operação sem dependência de e-mail/SMTP);
7. **Governança metodológica e travas de conclusão** (bloqueio de conclusão automática em `NEEDS_CLARIFICATION`, rejeição 422 a tentativas de aceitar ou rejeitar hipóteses insuficientes, controle de permissões por role, concorrência otimista e bloqueio estrito de hard delete com HTTP 409).

Foram criados **56 testes automatizados executáveis** distribuídos em 6 suítes modulares, sem dependência de contas ou serviços de nuvem reais (zero chamadas externas a OpenAI/Anthropic/Supabase Cloud).

---

## 2. Matriz de Jornada (PASS / FAIL / NOT_RUN)

| ID | Etapa da Jornada | Tipo de Teste | Status | Evidência / Arquivo |
|---|---|---|:---:|---|
| **J-01** | Validação de título vazio / whitespace em `/api/events` | Integração / Contrato | **PASS** | `01-event-registration.test.ts` |
| **J-02** | Validação de relato vazio / whitespace em `/api/events` | Integração / Contrato | **PASS** | `01-event-registration.test.ts` |
| **J-03** | Registro Safety puro (`register_only`) com 0 créditos e status `received` | Integração / Persistência | **PASS** | `01-event-registration.test.ts` |
| **J-04** | Inferência automática de data a partir da narrativa com rótulo explícito | Unitário / Expressão Regular | **PASS** | `01-event-registration.test.ts` |
| **J-05** | Limitação de extração de data em linguagem natural informal (sem rótulo) | Unitário / Expressão Regular | **PASS** | `01-event-registration.test.ts` |
| **J-06** | Bloqueio HTTP 402 em modo `hfa` para tenant trial sem créditos | Regra de Negócio | **PASS** | `01-event-registration.test.ts` |
| **J-07** | Bloqueio HTTP 402 em modo `hfa` para tenant trial expirado | Regra de Negócio | **PASS** | `01-event-registration.test.ts` |
| **J-08** | Liberação ilimitada em modo `hfa` para plano Enterprise | Regra de Negócio | **PASS** | `01-event-registration.test.ts` |
| **J-09** | Transição de créditos (débito de 1 crédito) e triagem `HFA_SELECTED` | Integração / Persistência | **PASS** | `01-event-registration.test.ts` |
| **J-10** | Limite de tamanho de arquivo (<= 10MB aceito, > 10MB rejeitado com `TOO_LARGE`) | Unitário / Contrato | **PASS** | `02-document-extraction.test.ts` |
| **J-11** | Detecção de PDF via magic bytes `%PDF` (`0x25 0x50 0x44 0x46`) | Unitário / Binário | **PASS** | `02-document-extraction.test.ts` |
| **J-12** | Detecção de DOCX via magic bytes PK ZIP (`0x50 0x4b 0x03 0x04`) | Unitário / Binário | **PASS** | `02-document-extraction.test.ts` |
| **J-13** | Rejeição de tipos não permitidos (.txt, .png, .exe) com `INVALID_TYPE` | Unitário / Binário | **PASS** | `02-document-extraction.test.ts` |
| **J-14** | Proteção contra spoofing MIME (.pdf contendo texto puro) | Unitário / Binário | **PASS** | `02-document-extraction.test.ts` |
| **J-15** | Arquivo de 0 bytes retorna `kind = null` sem exceção de leitura | Unitário / Binário | **PASS** | `02-document-extraction.test.ts` |
| **J-16** | Extração real de texto em documento PDF legítimo (`Example.pdf`) | Integração Real (Parser) | **PASS** | `02-document-extraction.test.ts` |
| **J-17** | Extração real de texto em DOCX legítimo (`HUMAN_APPLIED_SERA_...docx`) | Integração Real (Parser) | **PASS** | `02-document-extraction.test.ts` |
| **J-18** | Rejeição de PDF corrompido / truncado lançando `CORRUPT` ou `PARSE_FAILED` | Integração Real (Parser) | **PASS** | `02-document-extraction.test.ts` |
| **J-19** | Rejeição de DOCX corrompido lançando `CORRUPT` | Integração Real (Parser) | **PASS** | `02-document-extraction.test.ts` |
| **J-20** | Rejeição de PDF sem texto (< 25 caracteres / imagens) com `PDF_NO_TEXT` | Unitário / Contrato | **PASS** | `02-document-extraction.test.ts` |
| **J-21** | Mapeamento de PDF com senha para `PDF_PASSWORD` | Unitário / Contrato | **PASS** | `02-document-extraction.test.ts` |
| **J-22** | Limpeza de cabeçalhos repetidos (>= 4x) e normalização de espaços | Unitário / Heurística | **PASS** | `02-document-extraction.test.ts` |
| **J-23** | Contagem precisa de palavras por whitespace | Unitário / Heurística | **PASS** | `02-document-extraction.test.ts` |
| **J-24** | Rate limit de 10 uploads/hora por usuário com código `RATE_LIMIT` | Integração / Persistência | **PASS** | `02-document-extraction.test.ts` |
| **J-25** | Arquivo de 0 bytes em multipart de `/api/events` não grava anexo órfão | Integração / Persistência | **PASS** | `02-document-extraction.test.ts` |
| **J-26** | Normalização de horário (`14h30` e `14:30`) e diacríticos para duplicatas | Unitário / Normalização | **PASS** | `03-duplicate-detection.test.ts` |
| **J-27** | Não classificação de relatos curtos (< 120 chars) como duplicatas | Regra de Negócio | **PASS** | `03-duplicate-detection.test.ts` |
| **J-28** | Detecção de duplicata factual em relatos detalhados (>= 120 chars) | Regra de Negócio | **PASS** | `03-duplicate-detection.test.ts` |
| **J-29** | Exclusão de duplicata quando datas de ocorrência divergem | Regra de Negócio | **PASS** | `03-duplicate-detection.test.ts` |
| **J-30** | Exclusão de duplicata quando tipos de aeronaves divergem | Regra de Negócio | **PASS** | `03-duplicate-detection.test.ts` |
| **J-31** | Bloqueio 409 `POSSIBLE_EVENT_DUPLICATE` sem debitar créditos | Integração / Persistência | **PASS** | `03-duplicate-detection.test.ts` |
| **J-32** | Rejeição de override com justificativa curta (< 20 caracteres) | Validação / Contrato | **PASS** | `03-duplicate-detection.test.ts` |
| **J-33** | Aceitação de override com >= 20 chars e auditoria crítica | Integração / Auditoria | **PASS** | `03-duplicate-detection.test.ts` |
| **J-34** | Isolamento de listagem: Tenant Alpha não enxerga eventos do Tenant Beta | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-35** | Isolamento de listagem: Tenant Beta não enxerga eventos do Tenant Alpha | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-36** | Consulta GET cross-tenant retorna null/404 fail-closed | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-37** | Bloqueio de adulteração de `tenant_id` no payload do cliente | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-38** | Bloqueio 403 em `/api/analyze` ao tentar reanalisar evento de outro tenant | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-39** | Bloqueio 403 ao tentar impersonar `userId` divergente da sessão | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-40** | Isolamento de duplicatas: relatos idênticos em empresas diferentes não colidem | Segurança / Multi-tenant | **PASS** | `04-tenant-isolation.test.ts` |
| **J-41** | Preflight de IA (402 saldo insuficiente): não insere evento nem debita crédito | Resiliência / Atomicidade | **PASS** | `05-partial-failure-resilience.test.ts` |
| **J-42** | Falha de execução do motor SERA: marca evento `failed` e estorna créditos | Resiliência / Reembolso | **PASS** | `05-partial-failure-resilience.test.ts` |
| **J-43** | Falha de anexo no storage não aborta criação do evento Safety | Resiliência / Degradação | **PASS** | `05-partial-failure-resilience.test.ts` |
| **J-44** | Independência de e-mail: jornada opera sem variáveis SMTP/Resend | Operação / Autonomia | **PASS** | `05-partial-failure-resilience.test.ts` |
| **J-45** | Bloqueio de status `completed` quando `NEEDS_CLARIFICATION` | Governança SERA | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-46** | Bloqueio 422 a `ACCEPT_AS_WORKING_HYPOTHESIS` quando `NEEDS_CLARIFICATION` | Governança SERA | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-47** | Bloqueio 422 a `REJECT_WORKING_HYPOTHESIS` quando `NEEDS_CLARIFICATION` | Governança SERA | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-48** | Exigência de justificativa substancial (>= 10 chars) na revisão humana | Governança SERA | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-49** | Restrição de perfil: viewer bloqueado com 403 na revisão humana | Governança / RBAC | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-50** | Concorrência otimista (409) na colisão de versão de revisão | Governança / Concorrência | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-51** | Rejeição 422 a esclarecimento sem fato novo (`hasNoNewActorEvidence`) | Governança SERA | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-52** | Bloqueio de hard delete com 409 `EVENT_PURGE_DRY_RUN_ONLY` e log crítico | Governança / Ciclo de Vida | **PASS** | `06-governance-and-completion-lock.test.ts` |
| **J-53** | Execução ponta a ponta com instâncias do PostgreSQL Supabase Cloud real | E2E em Nuvem Real | **NOT_RUN** | Requer infraestrutura remota provisionada (proibido pela governança) |
| **J-54** | Chamada real a provedores externos de LLM (OpenAI/Anthropic/Groq) | Live LLM Network | **NOT_RUN** | Requer chaves e saldo real em provedor externo (proibido pela governança) |
| **J-55** | Validação E2E com browser real (Playwright) em staging | UI Automation | **NOT_RUN** | Reservado para release/staging governado |

---

## 3. Riscos Identificados e Classificação de Severidade

### [P1] Armazenamento Assimétrico de Documentos Anexos entre Safety e HFA
- **Arquivo / Linhas:** `frontend/src/app/api/events/route.ts#L293-L302` vs `L354-L367`
- **Condição:** Quando o evento é cadastrado em modo `register_only`, o arquivo anexo é registrado na tabela `event_documents` e no bucket `analysis-documents` sob `events/${submittedById}/${eventId}/${safeName}`. Porém, quando é cadastrado em modo `hfa`, o arquivo é salvo no storage sob `${submittedById}/${analysisId}/${safeName}` e registrado **apenas** no campo JSON `metadata` da análise SERA (`sera_vnext_analyses.metadata`), deixando a tabela `event_documents` completamente vazia!
- **Impacto:** A interface de listagem de documentos do evento e futuras features (como a issue #122 de multi-upload do AGENTE GEMINI 2) não encontrarão os documentos criados em modo HFA na tabela `event_documents`.
- **Recomendação:** Unificar a persistência inserindo sempre em `event_documents` independentemente do modo de submissão (ver patch proposto em `PROPOSED_PATCHES.md`).

### [P1] Trap de Duplicata em Falhas Transitórias (503) com Reenvio pelo Usuário
- **Arquivo / Linhas:** `frontend/src/app/(dashboard)/events/new/page.tsx#L156-L159` e `frontend/src/app/api/events/route.ts#L185-L196`
- **Condição:** Quando a análise SERA falha após a criação do evento, a API retorna HTTP 503 com `{ event_id, detail }` e o evento fica gravado no banco como `status = 'failed'`. Se o usuário ignorar o link do banner ("Abrir o evento registrado...") e clicar novamente em "Registrar e iniciar análise HFA", a API detecta o próprio evento anterior como uma duplicata e bloqueia a ação com HTTP 409 `POSSIBLE_EVENT_DUPLICATE`.
- **Impacto:** O usuário fica preso em um loop de duplicidade exigindo uma justificativa de override de 20 caracteres para algo que foi apenas uma falha transitória de inferência.
- **Recomendação:** No cálculo de candidatos a duplicatas em `findTenantDuplicateCandidates`, excluir eventos com `status = 'failed'` ou redirecionar automaticamente o cliente para o `event_id` já existente.

### [P2] Inconsistência de Coerção de Campos Opcionais (JSON vs Multipart)
- **Arquivo / Linhas:** `frontend/src/app/api/events/route.ts#L145-L146` vs `L166-L167`
- **Condição:** No multipart, `form.get('operation_type') ? String(...) : null` converte string vazia `""` para `null`. No JSON, `body.operation_type != null ? String(...) : null` converte string vazia `""` para `""`.
- **Impacto:** O banco de dados armazena valores divergentes (`null` vs `""`) dependendo do canal de submissão da API, impactando queries que utilizam `IS NULL` vs `LENGTH > 0`.
- **Recomendação:** Normalizar strings vazias para `null` em ambos os canais (`String(body.operation_type).trim() || null`).

### [P2] Limitação na Inferência de Datas em Linguagem Natural
- **Arquivo / Linhas:** `frontend/src/lib/sera-vnext/occurrence-date.ts#L10-L14`
- **Condição:** A função `inferOccurrenceDateFromNarrative` busca exclusivamente expressões rígidas ("data da ocorrência: DD/MM/AAAA"). Frases comuns em relatos operacionais como "No dia 18/10/2026 às 14h..." resultam em `null`.
- **Impacto:** O campo `occurred_at` não é populado automaticamente para a vasta maioria dos relatos informais, necessitando preenchimento manual do investigador.
- **Recomendação:** Ampliar os padrões da regex para capturar datas antecedidas por preposições temporais operacionais ("no dia", "em", "em data de").

---

## 4. Instruções de Reprodução dos Testes

Para reproduzir integralmente esta auditoria na branch local:

```bash
cd /private/tmp/hfa-gemini-event-journey-qa-20261105
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/run-all-journey-tests.ts
```

Ou executar qualquer suíte isolada:
```bash
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/01-event-registration.test.ts
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/02-document-extraction.test.ts
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/03-duplicate-detection.test.ts
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/04-tenant-isolation.test.ts
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/05-partial-failure-resilience.test.ts
NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/06-governance-and-completion-lock.test.ts
```
