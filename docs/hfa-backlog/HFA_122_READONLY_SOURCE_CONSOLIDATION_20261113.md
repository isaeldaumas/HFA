# HFA #122 — Rascunho de trechos com proveniência por fonte/página

Implementação: `EventConsolidatedSourcesPreview` e `verified-source-bundle`. O analista seleciona explicitamente fontes textuais já indexadas (PDF, TXT, DOCX) e aciona a prévia autenticada read-only, que valida no servidor original privado e SHA-256. Imagens e PDFs digitalizados sem texto reconhecido não são transformados artificialmente em texto, e documentos não verificados ou previews truncados são excluídos. As referências incluem ID/ordinal/SHA-256 do original, e números de página somente se comprovados pelo parser PDF. Linhas originais são prefixadas como citação para não simularem delimitadores de origem. A soma de caracteres é limitada, sem truncamento silencioso.

O rascunho permanece apenas na sessão do navegador, e a cópia exige clique explícito. Não é enviado a provedores de IA, não grava na análise nem edita P/O/A, risco, evento ou taxonomia. **Não é uma narrativa causal cientificamente validada.** A seleção é por fonte, não representa classificação de temporalidade antes/depois do ponto de fuga; esta separação requer revisão humana contextual, e é explicitamente informada ao usuário.

Gates: quatro testes adversariais de proveniência/limite/citação na CI Core, TypeScript, lint, build, SERA determinístico. CI e deploy exigidos antes de declarar publicado.
