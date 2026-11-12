# HFA — Fontes adicionais, limites reais e preservação da evidência

Data: 12/11/2026. Escopo estritamente documental, sem alterar o motor científico.

## Resultado esperado

Um evento de Safety/HFA previamente cadastrado poderá conter até cinco fontes
originais PDF/DOCX, armazenadas nas posições imutáveis 1 a 5.
A inclusão de evidências posteriores requer usuário autenticado com papel
admin ou analyst, empresa ativa e evento ativo. Não são alterados relato,
análise, classificações P/O/A, ponto de fuga, perfil de risco ou recomendações.

Na tela de detalhe do evento, um analista pode selecionar ou arrastar vários
documentos, retirar e reordenar a fila ANTES do envio. Os arquivos são
enviados individualmente e sequencialmente: um arquivo malsucedido não
descarta outro que já foi indexado. O resultado é visível por arquivo;
somente itens falhos podem ser reenviados. Itens com auditoria pendente
não são automaticamente reenviados.

## Limites físicos da hospedagem

As funções Vercel possuem limite de 4,5 MB tanto na entrada como na saída.
O bucket privado Supabase suporta PDF/DOCX até 10 MiB, mas isso NÃO implica
que uma rota Next.js consiga receber/responder 10 MiB em uma única chamada.

A rota de anexos adicionais aceita um arquivo por requisição, até
3.800.000 bytes, envelope multipart máximo 4.000.000 bytes. A interface
inicial de extração também passa a evitar arquivos acima de 3.800.000
bytes para não causar erro 413 da infraestrutura. O máximo por evento é
cinco documentos e 30 MB agregados.

Para arquivos originais indexados com até 10 MiB, o download privado usa
faixas de até 3.800.000 bytes (206 Content-Range), com verificação do hash
dos bytes completos no servidor antes de cada faixa e no browser após
a remontagem. Requisição sem Range acima do limite retorna erro específico,
em vez de responder 200 com bytes truncados.

Fonte: https://vercel.com/docs/functions/limitations

## Idempotência e concorrência

- O servidor calcula SHA-256 original; índice UNIQUE parcial por
  (tenant_id,event_id,content_sha256) para hashes não nulos impede duplicata
  em concorrência e não altera fontes legadas sem hash.
- O servidor determina a primeira posição livre de 1 a 5. Conflito entre
  envios simultâneos é bloqueado pelo índice de posição já existente.
- Falha na indexação provoca remoção compensatória do objeto recém-criado;
  falha de compensação é sinalizada como não verificada.
- O mesmo conteúdo em retry sequencial retorna already_present e não cria
  outro documento. O usuário não define event_id, tenant_id, uploaded_by,
  hash nem ordem por parâmetros de formulário.
- Auditoria de anexo é CRÍTICA; se o documento foi indexado e a auditoria
  falhou, o HTTP 202 audit_unverified deixa explícita a necessidade de
  verificação, sem reportar sucesso plenamente comprovado.
- Nenhum token, caminho privado ou byte de narrativa é emitido em log.

## Limite científico da funcionalidade

Estes arquivos adicionais são armazenados como originais, mas permanecem
com extractionStatus NOT_EXTRACTED e analysisChanged false.
**Não são automaticamente extraídos, concatenados, enviados a fornecedores
de IA ou usados para atualizar hipóteses causais.** Falta OCR para
imagem/PDF escaneado, suporte seguro a TXT/PNG/JPEG/WebP, vinculação a
página e revisão humana, conforme issue #122.
O status científico naturalístico do SERA permanece NOT_READY.

## Testes e liberação

Requer testes de: file MIME/assinatura, 413, corpo sem Content-Length,
papéis, 5 posições, total, duplicatas/idempotência, tenants cruzados,
exclusão, corrida concorrente e compensação, auditoria não confirmada,
Range e SHA de arquivo recuperado.
CI obrigatório HFA Core e SERA na PR e na main. Aplicar somente a migration
UNIQUE isolada em produção e registrar a versão exata no ledger Supabase;
publicar SHA exato Vercel --prod sem staging. A homologação entre dois
tenants reais sintéticos continua NOT_RUN até haver fixtures autorizadas.

## Checkpoint de banco aplicado em 12/11/2026

Supabase em PRODUÇÃO: migration event_document_sha256_unique executada com
success=true e ledger versão 20261112191818. O SQL do arquivo foi apenas
renomeado, preservando hash e conteúdo. Índice UNIQUE parcial verificado
em pg_indexes para tenant_id, event_id, content_sha256 quando hash não nulo.
RLS ON, bucket analysis-documents privado, zero registros atuais de
documentos; nenhum conteúdo de cliente consultado ou reprocessado.
