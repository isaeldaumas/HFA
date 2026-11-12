# HFA — Originais PNG/JPEG/WebP como evidência suplementar (issue #122)

Data: 12/11/2026. A presente alteração **não implementa OCR**.

## Fronteiras de escopo

- Somente analista/administrador autenticado do tenant e evento ativos pode anexar originais complementares.
- Cadastro inicial continua PDF/DOCX. Fila de originais adicionais aceita PDF/DOCX/TXT UTF-8/PNG/JPEG/WebP.
- Um arquivo por requisição, limite de 3.800.000 bytes, cinco fontes/evento e até 30MB totais, com bloqueio de concorrência pelos índices existentes.
- PNG/JPEG/WebP passam por validação de estrutura/magic, MIME, extensão, limites de dimensão (8192 por eixo, 25 milhões de pixels), recusa de APNG/WebP animado e recusa de containers truncados detectáveis. Não existe decodificação completa do raster nesta etapa; assinatura e cabeçalho não provam a veracidade do conteúdo visual.
- Bytes originais são gravados em bucket privado com caminho aleatório e SHA-256, origem ordinal e escopo de empresa/evento; upload não é reportado como sucesso se falhar Storage/índice; compensação permanece.
- Downloads exigem token, conferem evento/empresa/documento, path, MIME, tamanho, hash e entregam apenas como attachment, sem URL assinada/pública.
- Imagens não acionam a prévia textual: a interface informa explicitamente **OCR indisponível**. Chamada direta ao endpoint textual retorna NO_TEXT sem atribuir texto inventado.
- Não persistir conteúdo reconhecido, não concatenar narrativa, não modificar P/O/A, análise SERA, risco, Shadow, taxonomia ou classificações históricas. Nenhum provedor externo é utilizado.

## Migration isolada

A migration adiciona somente image/png, image/jpeg e image/webp à allowlist do bucket analysis-documents. Exige configuração anterior **exata** (privado, 10MiB, PDF/DOCX/TXT) antes da alteração; não modifica dados, policies ou grants. Após aprovação dos dois workflows na PR, aplicar migration no Supabase de produção, sincronizar versão do ledger e repetir gates da main antes de deployment.

## Limites de validação

- Não há OCR; imagem digitalizada continua DOCUMENT_ONLY / SEM_EXTRAÇÃO.
- O escopo não inclui arquivos animados, formatos legados, sanitização/regravação ou autenticação E2E real com dois tenants sintéticos.
- Testes sintéticos não equivalem a certificação do parser raster nem validam conteúdo causal do evento.
- Extrair imagem/PDF escaneado exigirá etapa separada com prova de capacidade em runtime Vercel, política de custo, controle de dados sensíveis, aprovação humana e opt-in de provedor externo, se escolhido.
- Não fechar a issue #122. Não declarar conformidade científica SERA.

## Gate de publicação

Exigir testes funcionais, contratos SQL/UI, TypeScript, ESLint e Next build, HFA Core e SERA Deterministic aprovados na PR e no commit final da main, migration real verificada, deploy exato READY, smoke de APIs sem autenticação e, separadamente, E2E real pendente até fixtures sintéticas aprovadas.
