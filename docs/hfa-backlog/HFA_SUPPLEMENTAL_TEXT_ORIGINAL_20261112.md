# HFA — TXT UTF-8 como fonte documental adicional

Data: 12/11/2026. Repositório isaeldaumas/HFA, issue #122.
Produção exclusiva sem staging. Funcionalidade estritamente documental.

## Escopo

- Adicionar TXT em UTF-8 somente aos anexos suplementares de
  eventos já existentes, no limite atual de até 5 fontes por evento,
  3.800.000 bytes por arquivo/4MB multipart e 30MB agregados.
- Não estender o fluxo original de criação de eventos nem sua extração
  inicial: prepareEventAttachment mantém PDF/DOCX por padrão;
  TXT exige allowText:true exclusivamente na rota de anexo adicional.
- Converter bytes somente com TextDecoder UTF-8 fatal, rejeitando
  arquivo vazio/só espaços, UTF-8 malformado, Unicode de controle e
  direcionamento bidirecional oculto, BOM embutido ou cabeçalhos de formatos
  binários conhecidos (PDF, ZIP, PNG, GIF, JPEG, RIFF WebP).
- Extensão .txt, MIME canônico text/plain (tipo de origem deve
  concordar ou estar vazio) e hash SHA-256 dos bytes originais, não do
  texto transformado. Carregar TXT apenas como texto inerte; nunca HTML,
  Markdown renderizado dinamicamente, comandos nem script.
- Persistência segue as mesmas APIs de arquivo privado: subcaminho
  gerado no servidor, tenant e evento autoritativos, UUID individual,
  ordinal e duplicata hash única, remoção compensatória, auditoria.
- Download verifica tenant+evento+documento+MIME+extensão/caminho e
  tamanho/hash antes de responder; apenas Content-Disposition attachment,
  Cache-Control private/no-store, nosniff, sem URL pública.
- Prévia de texto sob a mesma autorização admin/analyst, quota
  distribuída, evento ativo e hash original; não passa pelo parser
  PDF/DOCX, sem fornecedor de OCR e sem envio a terceiros.
  citationLevel=DOCUMENT_ONLY, nenhuma paginação TXT inferida,
  reviewedByHuman=false, analysisChanged=false.
- Texto não é persistido, não é anexado automaticamente à narrativa
  científica, e não altera motor SERA/P/O/A, risco ou Shadow.

## Banco Supabase

O bucket analysis-documents estava public=false, com limite de
10.485.760 bytes e uma allowlist limitada a application/pdf e MIME
DOCX. Migration isolada amplia somente allowed_mime_types com
text/plain, após verificar em transação que bucket, privacidade,
limite e tipos PDF/DOCX permanecem conforme esperado.

Não altera policies, RLS, documentos existentes, usuários,
empresas, colunas ou conteúdo dos 44 eventos; não há backfill.
Arquivo será renomeado para a versão efetiva registrada no ledger
Supabase após execução, preservando SQL byte a byte.

## Evidências esperadas e limites

- Testes com TXT UTF-8 com português acentuado, CR/LF/TAB, BOM;
  rejeição de binários disfarçados, UTF-8 inválido, NUL/control/bidi,
  MIME/extensão forjados, tamanho vazio.
- SHA/caminho/ordinal no Storage+índice, teste de tenant cruzado,
  download adulterado e quota de prévia sob as regras existentes.
- HFA Core CI, SERA deterministic na PR e main, TypeScript,
  ESLint e Next webpack build devem passar antes de release.
- Real HTTP autenticado com dois tenants sintéticos continua NOT_RUN
  até haver fixtures válidas e limpeza segura.
- Ainda não suporta OCR de PDF escaneado/imagem, PNG/JPEG/WebP,
  DOC legado, citação por página de DOCX/TXT nem fusão automática
  de fontes. A issue #122 permanece OPEN.

## Ledger Supabase de produção verificado

Migration event_documents_text_plain_allowlist aplicada com SUCCESS na
versão 20261112213954; arquivo SQL local foi RENOMEADO sem mudança de bytes.
Storage analysis-documents verificado: public=false, limite 10485760 bytes,
allowlist PDF+DOCX+text/plain; public.event_documents mantém RLS ON,
zero documentos indexados no momento da verificação (sem backfill).

Testes funcionais 52 e contratos 24 aprovados localmente antes do sync.
Esta migração não precisa ser reaplicada. Revalidar checks da PR e da main.
