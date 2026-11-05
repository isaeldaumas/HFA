# HFA V27 — Upload múltiplo: validação, persistência e bloqueio Storage

Data: 05/11/2026. Repositório: isaeldaumas/HFA. Branch de integração isolada: review/hfa-gemini-integration-20261105.

**Escopo:** alterações locais exclusivamente. Nenhum push, merge, deploy, aplicação de migration, criação de usuário, upload real ou alteração remota. O mecanismo científico, seus códigos e os oráculos V04 não foram modificados.

## Diagnóstico confirmado (fontes primárias)

A inspeção da implementação de upload da V25 mostrou:

1. O cliente enviava o primeiro documento nas duas chaves multipart, files e file. O servidor somava ambas por identidade de objeto, que não funciona de forma confiável após decodificação multipart. Um lote legítimo com cinco anexos podia ser rejeitado como seis.
2. A persistência armazenava alguns documentos cujo resultado de segurança estava inválido. Apenas mime_spoofing era explicitamente bloqueado, enquanto os demais erros podiam avançar.
3. O retorno de sucesso incluía descritores mesmo quando event_documents não era gravado. Falhas de Storage ou de metadata eram ocultadas; upsert:true permitia sobrescrever o mesmo caminho.
4. A palavra extracted era usada no descritor apenas por detectar a assinatura do PDF/DOCX/TXT, embora a persistência não extraísse texto.
5. A inspeção read-only do Supabase HFA ativo (projeto vbdpweliprcsktyxodss) confirmou o bucket analysis-documents com public=false, limite 10 MiB por arquivo e allowed_mime_types somente PDF e DOCX. Assim, TXT/JPEG/PNG/WebP permitidos pela UI não poderiam ser armazenados nesse bucket sem migração.
6. As políticas SELECT/INSERT/DELETE em storage.objects exigem que o primeiro diretório do objeto seja auth.uid(). O caminho antigo para relatórios Safety começava com events, impossibilitando acesso direto do titular por essas políticas. O caminho HFA usava submittedById público, que pode divergir de auth.users.id.

## Mudanças de código

- gemini-multifile-form.ts: escolhe files como formato primário quando presente; caso contrário aceita file legado. Nenhuma deduplicação por igualdade de instância File.
- Página events/new: envia apenas files, preservando interoperabilidade pelo lado do servidor.
- API extract-document: aplica o mesmo seletor para impedir contagem duplicada e rate-limit incorreto do primeiro arquivo.
- event-document-persistence.ts: valida limites de cinco arquivos, 10 MiB por arquivo e 30 MiB por lote, verifica o buffer e a assinatura e rejeita todos os resultados inválidos ANTES de criar evento. Persiste somente documentos confirmados por Storage e public.event_documents.
- Storage upload utiliza upsert=false; se a inserção no banco falha, remove apenas o objeto enviado pela operação. Falha de compensação é explicitamente indicada como possível objeto órfão.
- Caminho privado usa authUserId verificado no primeiro segmento, respeitando a política storage.foldername(name)[1]=auth.uid(). O banco continua usando uploaded_by do usuário público, sem confundir os dois IDs.
- Bucket MIME recebe contentType sem parâmetro de charset; o metadata conserva o MIME detectado.
- API events: se Safety foi criado mas os anexos falharam, devolve HTTP 503, event_id existente, status e orientação explícita para evitar duplicação. Se análise HFA foi concluída mas documentos falharam, mantém resultado científico/consumo de crédito e retorna HTTP 503 com event_id e analysis_completed=true; não finge que a análise falhou nem reembolsa a análise já entregue.
- Descritores de PDF/DOCX/TXT persistidos sem verificação textual informam stored_unprocessed. Imagens continuam unsupported_ocr, sem afirmar OCR não realizado.
- isUtf8Text agora usa decodificação fatal para rejeitar conteúdo binário disfarçado de TXT, inclusive sequências UTF-8 inválidas e controles binários.

## Migração local preparada, NÃO aplicada

Arquivo gerado por supabase migration new: supabase/migrations/20261105185907_hfa_multifile_analysis_documents_mime.sql.

A migração altera exclusivamente allowed_mime_types do bucket privado analysis-documents para PDF, DOCX, text/plain, image/jpeg, image/png e image/webp. Não torna bucket público, não altera políticas RLS, nem eleva limite de 10 MiB. Possui guards que interrompem aplicação se bucket, visibilidade, limite ou lista inicial de tipos divergir do esperado. Exige revisão de segurança e aplicação prévia no staging ISOLADO; NÃO foi executada no projeto real.

Efeito de segurança a revisar: ampliação de MIME também permite estes formatos aos usuários que já têm INSERT no bucket para sua própria pasta. Existe risco de consumo de armazenamento por upload direto, não limitado pelo formulário Next.js. A política e a quota do projeto devem ser avaliadas em homologação. Não substituir a proteção existente por bucket público.

## Evidências offline

- tests/hfa-audit/gemini-multifile/v27-attachment-persistence.test.ts executa validação e persistência contra dublês de Storage/PostgREST, incluindo seleção multipart, 5 arquivos válidos, 6 rejeitados, spoofing e bytes inválidos, falha de upload, DB insert, rollback, rollback falho, prefixo auth, não sobrescrita e OCR não suportado.
- A suíte principal passou a executar quatro grupos e não usa npx dinâmico; chama o binário tsx instalado no lockfile do frontend.
- Os contratos estruturais Gemini 2 foram reescritos para exigir a separação real do módulo de persistência e a ausência de duplo envio, em vez de preservar os defeitos antigos.
- O contrato da migração verifica sua lista explícita de MIME, os guards e a preservação de visibilidade/políticas.
- O TypeScript passou sem erros.
- O ESLint final concluiu com 0 erros e 29 avisos.
- O build completo Next.js passou com dependências instaladas na própria worktree e as seis flags Shadow desativadas; havia falhado inicialmente apenas por causa do link simbólico temporário de node_modules fora da raiz.
- Quatro suítes Gemini 2 concluíram PASS; o grupo novo V27 contém 15 testes de execução e inspeção local.
- As demais frentes Gemini 1 (56), Gemini 3 (38) e Gemini 4 (3 módulos) passaram na integração local. O contrato de caminhos SERA protegidos, o YAML da Core CI e o git diff --check também passaram.

## Regressão SERA determinística completa pós-commit

O runner completo scripts/run-sera-vnext-ci-regression.ts foi executado sobre a V27 em checkout inicialmente limpo, sem alterar flags ou casos científicos:
- Manifesto total: 251 casos; 198 selecionados pela regra de determinismo vigente.
- Executados: 196 casos; **194 PASS, 0 FAIL, 0 TIMEOUT, 2 NOT_READY**.
- Duas exclusões de CI já declaradas: dependência de artefato local e dependência de banco real; 7 baselines históricos preservados.
- Resultado do executor: **CI_PASS**. Os dois NOT_READY correspondem à validação naturalística V04 não liberada e não equivalem a validação científica aprovada.
- Os quatro arquivos de relatórios do engine-validation-v0 que foram regenerados pelos testes foram restaurados aos bytes do commit, sem introduzir novas divergências de referência.

O log local de execução está em /private/tmp/hfa-v27-sera-manifest-postcommit.log (somente no Mac autorizado). Não é evidência de QA com tenants reais nem de release de produção.

**Limites importantes:** não houve upload real, HTTP autenticado de duas empresas, aplicação de migração, prova de conformidade das políticas em staging, nem validação V04. A inspeção de projetos da conta Supabase conectada identifica apenas um HFA ativo, e um projeto distinto e inativo; isso não comprova staging independente. A prontidão de release segue BLOQUEADA.

## Próximas condições de homologação

1. Definir staging com Storage e banco exclusivos, sem dados pessoais reais, mediante autorização de criação/configuração.
2. Aplicar a migração somente no staging e confirmar a política do bucket privado.
3. Usar dois usuários sintéticos distintos, incluindo um com public.users.id diferente de auth.users.id: testar upload de PDF/DOCX/TXT/PNG/JPEG/WebP, download autorizado, acesso cruzado negado, exclusão e reprocessamento.
4. Testar erro de insert depois de upload, rollback e compensação falha com logs de operação, sem gerar evento duplicado.
5. Executar todos os gates de CI, revisar mudanças no executor SERA e obter as autorizações independentes para GitHub e produção.
