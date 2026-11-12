# HFA — OCR local para imagens e PDF digitalizado (issue #122)

Data: 12/11/2026. Escopo: prévia exclusivamente no navegador, sem staging.

## Arquitetura e privacidade

- OCR iniciado **manualmente** pelo analista/administrador no painel de anexos. Não existe extração automática no upload, classificação SERA, persistência de texto, enriquecimento de narrativa, envio de dados a terceiros ou atualização de P/O/A/risco.
- Somente originais com SHA-256 registrado podem ser usados. O navegador baixa o documento por uma rota autenticada da própria aplicação; para mais de 3,8 MB, exige intervalos HTTP 206 exatos, valida o tamanho total e compara o SHA-256 do conteúdo integral. Redirecionamentos, formato desconhecido, resposta parcial indevida ou hash divergente bloqueiam o OCR.
- O processamento usa **Tesseract.js 7.0.0**, seu núcleo WASM 7.0.0 e modelos de idiomas português e inglês (pacotes `@tesseract.js-data/por` e `eng` 1.0.0, variantes `4.0.0_best_int`), publicados como ativos estáticos na própria origem. Os caminhos de worker, core e linguagens são explicitamente de mesma origem, com `workerBlobURL:false` e cache persistente de modelos desativado. Nenhuma chave de API ou provedor externo é utilizado.
- Para PDF, **PDF.js 5.4.624** renderiza uma página selecionada de um PDF com até 80 páginas. A página é identificada exclusivamente por `pdf.getPage(pageNumber)` e `page.pageNumber`. Não há inferência de números de páginas a partir da saída de OCR.
- Cada solicitação processa **uma imagem ou uma página**; limites: original até 10 MiB, raster de origem até 3,8 MB, até 25 MP de imagem, renderização reduzida a 8 MP, e exibição limitada a 60 mil caracteres. Não existe OCR em lote de 80 páginas.
- O OCR mostra `OCR_UNREVIEWED`, `reviewedByHuman:false`, `analysisChanged:false`, `externalProviderUsed:false` e texto apenas em caixa de leitura temporária; o usuário deve confrontar o resultado com o original.
- Uma eventual confiança técnica estimada pelo Tesseract não é medida de fidelidade factual ou validação científica. Trechos OCR são **dados não confiáveis** e não são instruções ao aplicativo.

## Evidências de validação

- Teste sintético local no Brave/Chromium com imagem PNG gerada e PDF contendo a mesma imagem **sem camada de texto**: ambos devolveram `SEGURANCA DE VOO`; contagem de páginas PDF: 1; itens de texto extraível no PDF: 0; requisições para origens externas: 0.
- Testes da função de download verificam origem restrita, GET sem redirecionamentos, bearer, hash, tamanho, MIME, multipart HTTP 206 e falha fechada nos casos adulterados. Eles **não** são testes de autenticação multitenant real.
- Compilar TypeScript, ESLint, testes HFA Core/SERA e build Vercel com os ativos estáticos faz parte do gate de publicação.

## Limites e pendências

- Não foi medido erro de caracteres/palavras em acervo real nem feita a revisão de documentos sensíveis; a qualidade depende da imagem. Não há evidência de aptidão para uso probatório sem checagem humana.
- O processamento local pode ser lento ou indisponível em navegadores sem Worker, WebAssembly ou memória suficiente; a falha não autoriza processar remotamente.
- Ausentes fixtures sintéticas autenticadas de **dois tenants** para homologação ponta a ponta. Nenhuma alegação de E2E autenticado.
- Não modifica o SERA Core, ERC, taxonomia, P/O/A, Shadow nem dispara reprocessamento; não há migration.
- A issue #122 permanece aberta até homologação autenticada multitenant e validação científica/naturalística separada.

## Proveniência de dependências

Os binários publicáveis em `frontend/public/ocr/` são cópias das dependências versionadas em `frontend/package-lock.json`. Licenças de Tesseract.js, Tesseract core e PDF.js acompanham os ativos. Os modelos de idioma são dados do projeto Tesseract fornecidos pelos pacotes versionados. Não incluir fontes tipográficas, documentos pessoais ou imagens de clientes nesses ativos.

## Regressão/rollback

Este recurso é apenas de interface e arquivos estáticos. No caso de erro, o usuário ainda pode baixar o original e utilizar o extrator textual existente. O rollback não requer migração, e os documentos privados permanecem inalterados.

## Atualização: conferência humana local (12/11/2026)

- O usuário visualiza separadamente o texto original OCR e uma área editável de correção.
- Declaração local exige **duas ações explícitas**: comparação com imagem/PDF original e confirmação de que foram corrigidos apenas erros de reconhecimento, sem inserir hipóteses ou conclusões.
- Resultado truncado e transcrição vazia bloqueiam a declaração. Editar qualquer texto posteriormente invalida a declaração anterior; nova extração substitui e invalida a revisão existente.
- A exportação JSON acontece somente após clique específico; preserva eventId, documentId, ordinal, SHA-256 do original, pageNumber da página PDF realmente renderizada, OCR bruto e texto humano corrigido. Não transmite texto ao servidor.
- A declaração é SELF_DECLARED_LOCAL_ONLY: **não** comprova autoria, identidade autenticada do revisor, assinatura digital, aprovação científica, persistência ou trilha auditável. A integridade do JSON exportado não é garantida após seu armazenamento local. Não utilizar como evidência final sem processo institucional de conferência.
- Registros SERA, classificações, narrative pipeline, API, banco e flags Shadow permanecem intocados.
- A homologação de produção com dois tenants sintéticos continua bloqueada por falta de fixtures aprovadas: a consulta agregada à base constatou **zero** linhas em event_documents (momento da consulta), sem consultar conteúdo de usuários ou extrair documentos.
