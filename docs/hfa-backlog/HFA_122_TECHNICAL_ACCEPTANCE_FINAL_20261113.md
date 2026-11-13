# HFA #122 — fechamento do aceite técnico (13/11/2026)

## Versão e governança

Repositório isaeldaumas/HFA, issue #122. Desenvolvimento em worktree isolada; checkout principal com alterações preexistentes foi preservado. Publicação direta em produção foi autorizada pelo proprietário; não se exige staging, mas os testes locais, HFA Core CI e SERA Deterministic Regression continuam obrigatórios.

## Evidência de teste autenticado com originais sintéticos

- API real: POST /api/events criou um evento exclusivamente sintético; cinco uploads heterogêneos em requisições separadas resultaram em cinco registros ordenados e hashes SHA-256 coincidentes. Reenvio idempotente não duplicou anexo nem evento. O runner executou com duas empresas efêmeras, confirmando isolamento entre tenants e retorno HTTP 404 no acesso cruzado.
- Navegador Brave/Chromium, autenticação proveniente de sessão real do Supabase armazenada temporariamente no navegador: fila com cinco fontes; registro de um evento; falha HTTP 503 deliberadamente injetada no upload de um documento; interface apresentou falha parcial e permitiu retomada; reenvio recuperou todos os documentos sem novo cadastro ou análise. Evidências: BROWSER_FULL_FIVE_SOURCE_EVENT_DB_PASS, BROWSER_PARTIAL_UPLOAD_FAILURE_VISIBLE_PASS, BROWSER_RECOVERED_WITHOUT_DUPLICATE_REGISTRATION_PASS.
- Verificações adicionais: MIME/assinatura forjados rejeitados, fonte PDF sem camada textual não tratada como OCR, revisão OCR autenticada com idempotência, integridade original e prévia textual, e proteção da classificação SERA contra alteração por anexação.
- Todas as contas, tenants, eventos, fontes e objetos de teste foram exclusivamente sintéticos. Os runners concluíram com saída 0 e SYNTHETIC_FIXTURE_CLEANUP_VERIFIED_NO_ROWS. Conferir também a consulta independente ao Supabase na conclusão.

## Correções de integridade nesta entrega

- Um upload só recebe estado local saved se o servidor retornar created (HTTP 201) ou already_present (HTTP 200) **e** o SHA-256 do comprovante for idêntico ao SHA-256 dos bytes enviados. Respostas com SHA divergente, ausente ou malformado são tratadas como falha, sem sucesso implícito.
- Bateria direcionada inclui perda de conexão, retomada, colisão de comprovantes, respostas HTTP 413/409/503 e auditoria 202 não confirmada.
- Avaliador Python offline HFA122-OCR-EVAL-2 integrado ao repositório, com verificação de original por assinatura e SHA-256, consentimento, ground truth humano, textos independentes e medição CER/WER estrita e normalizada. Testes sintéticos adversariais aprovados; resultado não é certificação científica.

## Retenção e exclusão

A checagem de código e esquema confirmou que event_documents é ligado a events com ON DELETE CASCADE, as revisões OCR também têm vínculo cascata, e a rotina de impacto de exclusão enumera objetos no Storage do evento antes da purga. A purga efetiva usa gate específico para fixtures sintéticas, período de recuperação e confirmação de ausência no Storage. Não executar uma purga real prematura apenas para forçar teste. A limpeza imediata dos fixtures do E2E foi verificada; isso não equivale a comprovar o fluxo completo de purga após 30 dias.

## Limites do aceite

Não há corpus naturalístico autorizado com transcrições de referência revisadas. A qualidade real do OCR continua NOT_RUN e não pode ser inferida de testes sintéticos. A classificação temporal antes/depois do ponto de fuga e a interpretação causal exigem revisão humana; não devem ser produzidas ou certificadas automaticamente. Esses itens permanecem fora do aceite técnico automatizado e impedem fechar a issue como cientificamente concluída.
