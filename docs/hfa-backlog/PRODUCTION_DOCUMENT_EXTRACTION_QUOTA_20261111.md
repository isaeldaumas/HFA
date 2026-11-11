# HFA - Contencao da extracao documental em producao

## Diagnostico do codigo anterior (11/11/2026)

O endpoint POST /api/extract-document permite PDF textual ou DOCX, com limite nominal de 10 MB por arquivo e 10 extracoes/hora por usuario. A consulta da contagem na tabela public.sera_document_uploads era feita antes do processamento, mas a falha SQL apenas gerava aviso e deixava a extracao prosseguir. O registro final de uso ignorava seu resultado. Requisicoes concorrentes podiam observar contagem inferior ao limite e extrair simultaneamente acima do orcamento.

A rota anterior chamava req.formData() antes de impor qualquer limite global ao corpo, dependendo apenas de File.size apos carregar multipart.

## Correcao isolada

- Autenticacao via requireBearerUser preservada, sem expor outros tenants.
- Leitura do multipart limitada a 11 MiB, mesmo sem Content-Length; arquivo individual continua limitado a 10 MiB.
- Verificacao de extensao, MIME (quando informado) e assinatura antes do parser.
- Funcao public.hfa_reserve_document_extraction(uuid) SECURITY INVOKER, RPC apenas para service_role, transacao PostgreSQL. Lock transacional por usuario torna atomica a contagem historica e a insercao da reserva; limite fixo 10 tentativas por janela movel de 1 hora. A tabela sera_document_uploads ja possui RLS e acesso apenas ao backend.
- HTTP 429 + Retry-After quando excedido; HTTP 503 quando DB/RPC/config indisponivel; HTTP 413 se multipart ou arquivo excede limite.
- Erros completos dos parsers nao sao registrados nos logs.
- Um arquivo com assinatura valida consome uma tentativa antes da extracao, mesmo se o parser falhar. Isso elimina extracoes gratuitas nao contabilizadas.

## Limites de escopo

Nao faz OCR, nao adiciona anexos multiplos, nao altera P/O/A, taxonomia, validacao cientifica ou Shadow. Issue #122 continua aberta. Limite por usuario Auth e nao por tenant, preservando contrato anterior. A chamada REST direta ao RPC deve ser negada a anon/authenticated.

Gates de producao: CI obrigatorio PR/main, migration aditiva isolada e registrada no ledger, inspecao ACL/RLS, teste de quota com rollback, deploy SHA exato Vercel CLI, smoke de endpoints sem autenticar e observacao 5xx. Nao criar identidades ou eventos reais para teste.
