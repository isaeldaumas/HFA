# HFA — Proveniência de páginas no PDF original, sem inferência causal

Data: 12/11/2026. Próximo incremento independente da issue #122.

## Situação anterior

A PR #135 colocou em produção a prévia textual autenticada por documento
original, mas a origem era somente DOCUMENT_ONLY. O parser retornava um texto
contínuo, sem referência da página na qual cada trecho aparecia.

## Incremento técnico

- O parser pdf-parse-fork existente recebe uma função pagerender que
  registra a página numérica entregue pelo PDFJS (page.pageNumber);
  não há estimativa de página por quebras de texto, posições na narrativa,
  modelo de linguagem ou conclusões de investigação.
- O texto de cada página fica segregado por pageNumber (1-based).
  Somente se todas as páginas forem visitadas, exatamente uma vez e
  em sequência, o resultado recebe citationLevel=PDF_PAGE_INDEXED.
  O fork do pdf.js pode esconder erros por página; detectamos explicitamente
  falhas e páginas incompletas em vez de atribuir referência incorreta.
- PDF com mais de 80 páginas retorna erro de limite, sem alegar leitura
  completa. Total de texto de resposta até 60 mil caracteres (parágrafos
  e rótulos acrescentam apenas um overhead limitado); o campo truncated
  indica que parte do texto não foi exibida.
- Página sem camada textual mantém hasText=false, text=''; não inventa
  texto nem realiza OCR. O operador vê a ausência e deve conferir o original.
- DOCX mantém citationLevel=DOCUMENT_ONLY; o documento Word não recebe
  número de página artificial, pois a paginação depende do mecanismo de layout.
- A UI apresenta cada página em área separada com fonte, número, quantidade
  total e indicação de truncamento/ausência de texto. Somente analistas/admin,
  preservando todos os gates de autorização, hash SHA256 e quota distribuída da
  PR #135.
- Nenhuma coluna/migration, nenhum texto salvo, nenhuma alteração em narrativa,
  resultados P/O/A, motor SERA, Risk Layer, flags Shadow ou cadastramento.

## Limitações explícitas

- Identificação por página é localização da extração, não comprovação
  científica de que as alegações do relatório são verdadeiras.
- A transcrição pode conter erros de ordenação e qualidade inerentes ao PDF;
  revisão humana e confronto com o original permanecem obrigatórios.
- Sem OCR para PDF escaneado e imagens, sem JPG/PNG/WebP/TXT, sem concatenação
  causal de fontes e sem transposição automática do texto ao SERA.
- Não constitui teste autenticado entre duas empresas sintéticas; essa
  homologação depende de fixtures válidas que não existem neste momento.
- PDFs malformados, protegidos, incompletos e extrações parciais não produzem
  página referenciada como se fosse evidência validada.

## Validação

- Parser real em PDFKit sintético de duas páginas, contendo afirmações
  diferentes em cada página, e PDF com página sem texto.
- Limite de 60 mil caracteres, erro para assinatura não-PDF e integração
  com o contrato de preview original, quota, JWT, tenant e hash.
- HFA Core CI e regressão determinística SERA na PR e main, build Next
  webpack, TypeScript e ESLint; publicação direta SHA exato Vercel --prod,
  sem staging. Código original sujo do proprietário preservado.
