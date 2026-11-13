# HFA #122 — homologação autenticada de cinco fontes e correção POST sem corpo

Data: 13/11/2026 (BRT). Repositório `isaeldaumas/HFA`.

## Defeito encontrado em produção

A chamada autenticada `POST /api/events/{id}/documents/{documentId}/preview` com corpo HTTP vazio retornou `400 BODY_NOT_ALLOWED` durante o E2E real, embora a própria interface `EventSourceTextPreview` envie `POST` sem payload. O middleware pode apresentar um stream de corpo **já encerrado**, que é semanticamente vazio mas não é `null`. A validação anterior recusava incondicionalmente qualquer `req.body !== null`.

## Correção

`hasUnexpectedPreviewRequestBody` verifica `Content-Length` e lê apenas o primeiro estado do stream. Permite `null` ou stream encerrado sem chunks. Rejeita qualquer chunk transmitido, mesmo com `Content-Length: 0`, valor inválido, erro no stream ou bytes escondidos. Nunca decodifica, grava ou divulga o conteúdo; não modifica o resultado SERA. Quatro testes novos verificam os cenários de sucesso e rejeição. Adicionado ao workflow oficial HFA Core.

## Evidência de homologação de cinco fontes

Runner `frontend/tools/run-five-source-ocr-synthetic-production-e2e.mjs`: controlado por flags explícitas, produção fixa `https://systemhfa.vercel.app/`, dois tenants temporários totalmente sintéticos, login real Supabase e APIs reais. Usa original PNG e JPEG/TXT/PDF/DOCX de fixtures locais; valida assinatura falsa 400, colisão concorrente de ordinal, limite de cinco, SHA-256 de bytes baixados e isolamento 404 entre tenants, idempotência, resumo OCR e prévia explícita. Nenhum conteúdo operacional de cliente é criado.

Primeira execução (antes desta correção): **seis verificações de isolamento de evento**, **seis de isolamento documental**, revisão OCR autenticada dos dois tenants, rejeição MIME falsa, fontes adicionais e downloads SHA-256 passaram até a prévia TXT; a prévia retornou HTTP 400 e a execução completa foi marcada **FAIL**. As 10 fontes indexadas e os registros de testes foram eliminados; consulta SQL posterior confirmou zero tenants/eventos/storage dos UUIDs sintéticos, zero usuários sintéticos e zero documentos/revisões. Um marcador de recuperação foi mantido para inspeção e removido depois da verificação SQL.

**Não considerar o E2E de cinco arquivos PASS antes de reexecutá-lo integralmente após o deploy.**

## Gates e limitações

Rodar lint, typecheck, build, testes oficiais Core e SERA, verificação de main/commit, deploy direto em produção e repetição do E2E. Limites científicos: OCR sintético não implica precisão em documentos naturalísticos; textos extras são originais preservados, não autorizam inferência automática em SERA/P/O/A.
