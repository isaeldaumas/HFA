# HFA — Proveniência por documento, download privado e preparação para múltiplas fontes

Data: 12/11/2026. Execução limitada à integridade operacional de anexos, sem interferência na metodologia científica SERA.

## Diagnóstico verificado

- public.event_documents já armazena tenant_id, event_id, uploaded_by, nome, caminho e tamanho, mas não possui hash para comprovar a igualdade dos bytes recuperados.
- O bucket analysis-documents é privado, com limite de 10 MiB e MIME PDF/DOCX. O schema é protegido por RLS. Na inspeção de produção havia zero registros em public.event_documents, portanto não existe conteúdo legado para converter neste momento.
- O registro de Safety/HFA já grava um único anexo por evento; não havia API de listagem e download por documento aplicando explicitamente a identidade de empresa do bearer validado.
- A issue #122 solicita proveniência individual, múltiplos anexos e OCR. Esta entrega **não ativa múltiplos anexos nem OCR**, para não alterar a entrada causal do motor antes da calibração.

## Implementação técnica

1. Coluna aditiva e nullable content_sha256 (hex SHA-256 dos bytes originais). Um documento antigo sem hash permanece NULL e é claramente classificado como LEGACY-UNVERIFIED, nunca marcado como validado.
2. source_ordinal (1..5, default 1) para preservar a ordem original, com unicidade por tenant/evento/posição. A criação atual usa somente a posição 1.
3. SHA-256 calculado no servidor no momento do upload, inserido no mesmo registro indexado no banco; a compensação de falha já existente permanece.
4. GET /api/events/[eventId]/documents: exige JWT válido e associação autoritativa ao tenant; verifica evento ativo daquele tenant; devolve somente metadados, nunca bucket/path/segredo.
5. GET /api/events/[eventId]/documents/[documentId]: exige JWT, verifica evento, tenant, ID e vínculo do documento no banco antes de ler objeto com service_role. Verifica padrão do path, MIME, tamanho máximo, bytes retornados e hash original. Falha de hash retorna 409, sem bytes; falha de banco/storage retorna 503; evento/documento ausente de outro tenant retorna 404.
6. Download pela aplicação, não por URL pública ou signed URL. Respostas com Cache-Control private/no-store, nosniff, download como attachment e nome sanitizado contra CRLF.
7. A tela de detalhe do evento agora apresenta lista ordenada dos documentos originais, hash quando disponível e botão de download. Informa que armazenamento **não é extração nem validação humana**.

## Testes e limites

- Contratos de autorização, cross-tenant, MIME, caminho incompatível, hash divergente, tamanho, storage indisponível, nome hostil, legado sem hash e vazamento de path.
- Integração com os testes existentes de upload, compensação, antifraude de tipo e limite de corpo.
- Não executa OCR, TXT/JPEG/PNG/WebP, fusão de narrativas, detecção de causalidade ou alteração de rótulos P/O/A.
- Não afirma E2E autenticado real: dois usuários sintéticos independentes ainda não foram disponibilizados. O teste efetivo atual de RLS para identidade não vinculada é mais limitado.
- Sem backfill de dados reais. A tabela estava vazia na inspeção de 12/11/2026; colunas permanecem compatíveis com futuro legado.
- A issue #122 permanece OPEN para UI multi-select 3–5, total de tamanho, extração por fonte, OCR consentido, citações por página e ensaio autenticado cross-tenant.

## Procedimento de produção

Required CI Core e regressão SERA em PR e main. Aplicar somente a migration aditiva específica em produção e reconciliar seu nome exato com o ledger. Confirmar coluna, constraint, unicidade, RLS e bucket privado sem exibir conteúdo. Fazer deploy Vercel --prod de SHA exato, verificar READY e HTTP 401 nas novas rotas sem autorização; consultar logs recentes. Não ligar Shadow nem cadastro.

## Ledger de produção confirmado

O Supabase aplicou a alteração no histórico de migrations na versão
20261112181117, nome event_document_sha256_source_ordinal. O arquivo
foi RENOMEADO sem modificar o conteúdo SQL. Duas colunas, duas
constraints e um índice único verificados no banco; RLS permanece ativo,
o bucket analysis-documents permanece privado, e não havia linhas de
documentos existentes a reprocessar. Nenhum conteúdo de cliente foi consultado.
