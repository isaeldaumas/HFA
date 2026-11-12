# HFA — Integridade dos anexos em eventos (produção, 12/11/2026)

## Diagnóstico verificado na aplicação

1. A rota de Safety ignorava a falha de upload ou de indexação em event_documents, continuava o fluxo e respondia 201 de evento sem revelar que o arquivo faltava.
2. Na criação HFA, a rota só acrescentava sourceFileUrl à metadata quando o upload não retornava erro e ignorava tanto o erro de upload quanto a falha de atualização da metadata, permitindo uma análise aparecer como concluída sem a prova documental.
3. O multipart era parseado sem limite global antes da análise do File.size. JSON podia ser carregado integralmente sem limite de bytes.
4. O formulário já tinha mecanismo para exibir event_id em respostas de falha. Esse mecanismo é preservado e sua mensagem foi esclarecida para evitar duplicações.

## Correção

- Pré-verificação de PDF/DOCX (tamanho, extensão, MIME e assinatura) antes de qualquer criação de evento.
- Multipart limitado a 11 MiB de corpo total, inclusive sem Content-Length, e JSON a 2 MiB.
- Só um anexo por evento nesta versão; múltiplos arquivos são rejeitados explicitamente, nunca descartados silenciosamente.
- Upload com identificador UUID sob diretório do Auth user + evento e upsert=false, evitando sobrescrever anexos existentes; grava o registro correspondente em event_documents com tenant_id, event_id e uploaded_by.
- Se o upload falhar, nenhum índice é gravado. Se o índice falhar, remove o objeto enviado; se essa compensação falhar, o estado fica explicitamente unverified.
- Quando o evento já existe e a persistência falha, responde HTTP 502, event_id e status do anexo, sem afirmar êxito. O evento não é removido, para não apagar a trilha de auditoria. A interface oferece o link para o registro original e orienta a não reenviar como ocorrência nova.
- O fluxo HFA só debita o crédito e executa o motor depois da persistência documental. O vínculo posterior da metadata exige atualização verificada; se falhar, entra no caminho de falha da análise e restituição já existente.
- Um novo tipo de auditoria crítico, event_attachment_failed, não inclui conteúdo, nome do documento, storage path ou credenciais.

## Limitações e aceite

Não acrescenta OCR, processamento de PDFs escaneados, múltiplos anexos, nem altera lógica P/O/A, taxonomia, calibragem científica ou Shadow. A issue #122 segue aberta. O armazenamento+índice não é uma transação distribuída; o código implementa compensação best-effort e reporta incerteza quando ela falha. Nenhum usuário/tenant real foi criado para teste.

Antes de implantação: TypeScript, ESLint, build Next, testes de assinatura/MIME/tamanho, upload/índice/remoção e contratos de rota. Required CI em PR e main. Sem migrations nesta atualização. Deploy Vercel CLI direto em produção, SHA verificado e smoke público sem credenciais, com limitação explícita de teste autenticado de documento completo.
