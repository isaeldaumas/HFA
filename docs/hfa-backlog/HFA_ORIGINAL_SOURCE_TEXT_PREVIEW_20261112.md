# HFA — Prévia textual por fonte original (PDF/DOCX), sem efeito causal

Data: 12/11/2026. Repositório HFA, issue #122, execução somente produção.

## Problema verificado

A tela de detalhe do evento permite até cinco fontes originais PDF/DOCX e download
privado, mas não apresentava uma leitura textual isolada por documento para revisão
humana. A análise SERA não deve absorver automaticamente evidência posterior ao
ponto de fuga.

Um teste com PDF sintético válido produzido por PDFKit expôs uma falha real da
dependência pdf-parse-fork: Buffer direto causava bad XRef entry. Passar o mesmo
conteúdo por um Uint8Array genuíno, sem modificar os bytes originais, foi
confirmado no teste de parser. DOCX real de teste (ZIP Office Open XML sintético)
já era legível.

## Implementação

- Botão Extrair texto para revisão por documento original na tela do evento,
  visível somente a papéis admin e analyst.
- API POST sem corpo em /api/events/[eventId]/documents/[documentId]/preview.
  Exige bearer validado, identidade de empresa obtida do banco e papel autorizado.
- Resolução do evento ativo e documento vinculado ao tenant,
  SHA-256 não nulo, quota distribuída já existente
  hfa_reserve_document_extraction (máximo dez tentativas por hora),
  download do objeto original com tamanho, caminho e hash confirmados
  antes de passar bytes ao parser.
- Comparação da assinatura PDF/ZIP DOCX com MIME e extensão antes da extração;
  uso dos parsers PDF e DOCX existentes, sem fornecedor externo.
  Toda inconsistência de documento, identidade, quota, MIME ou armazenamento
  bloqueia a extração antes de devolver texto.
- Texto somente em memória da função e no estado React da página; HTTP com
  no-store e Vary Authorization. Resposta limitada a 60 mil caracteres;
  truncamento e ausência de OCR declarados explicitamente.
- Prévia vinculada ao documento ID, SHA-256, ordinal, nome e evento.
  O servidor retorna reviewedByHuman=false, analysisChanged=false,
  citationLevel=DOCUMENT_ONLY, externalProviderUsed=false.
  Não é citação por página nem validação do conteúdo.
- Erros de parser são traduzidos em mensagens genéricas, sem vazar conteúdo
  potencialmente confidencial da exceção. PDF escaneado/sem texto retorna
  422 NO_TEXT e não é tratado como extraído.
- Nenhuma coluna, tabela ou migration nova. Não persiste o texto, não
  converte dados existentes e não executa OCR.

## O que NÃO é homologado

- Não altera relato, classificação P/O/A, condições, precondições,
  recomendações, decisão científica, risco ou resultado SERA.
- Não extrai texto de imagens JPEG/PNG/WebP ou PDF digitalizado sem camada
  textual. Não inventa texto, não concatena várias fontes no relato, não mescla
  testemunhos e não escolhe automaticamente evidência causalmente pertinente.
- Não captura número de página: proveniência no nível do documento.
  Citação por página e revisão científica permanecem independentes na issue #122.
- A validação real HTTP entre duas empresas sintéticas ainda não ocorreu
  porque as fixtures independentes não estão disponíveis; testes locais de
  contrato e isolamento não substituem esse ensaio.

## Gates e publicação

Testes unitários de assinatura, hash divergente, fonte legada sem hash,
ID inválido, quotas, bloqueio antes do Storage e do parser, texto vazio,
truncamento, falhas de OCR, não vazamento de exceções, UI e API sem gravação;
testes com PDF e DOCX reais sintéticos usando parser efetivo.
TypeScript, ESLint, Next build e dois workflows obrigatórios na PR e main
antes de publicar via Vercel production em commit SHA exato.
Sem alterar flags Shadow e sem habilitar o cadastro público.
