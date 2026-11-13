# HFA #122 — até cinco originais na criação inicial

A tela `/events/new` mantém a fonte principal PDF/DOCX existente e permite que o usuário selecione até quatro originais suplementares (ou até cinco após cadastro de relato textual). As fontes complementares são aceitas nos formatos PDF, DOCX, TXT UTF-8, PNG, JPEG e WebP com limite 3,8 MB por arquivo; a validação de assinatura/MIME real, SHA-256, ordinal, controle de acesso e limites fica no servidor existente `POST /api/events/{eventId}/documents`.

O cadastro do evento e sua eventual análise SERA/HFA ocorrem uma única vez; em seguida o navegador envia cada original suplementar em chamada separada, respeitando limites de payload da Vercel. Se o upload falhar, o evento **já criado** não é registrado novamente no retry; o navegador preserva a referência a ele e apenas retoma anexos pendentes. HTTP 202 `audit_unverified` nunca é apresentado como auditoria confirmada. Duplicatas reconhecidas pelo servidor via SHA-256 retornam `already_present`. Arquivos extras **não** são incorporados automaticamente à narrativa ou a P/O/A, fator de risco, decisão ou conclusão científica.

Limitação de design: o cadastro inicial e os anexos suplementares constituem transações separadas; se o navegador for fechado antes de concluir, deve-se abrir o evento registrado e consultar os originais existentes antes de reenviar. A tela informa explicitamente falhas parciais e fornece link do evento.

Testes em `frontend/tests/additional-originals.test.ts` cobrem capacidade, tipos/tamanho, idempotência, retomada sem duplicação, HTTP 202 não confirmado, falha de rede e resposta HTTP falsamente bem-sucedida. Para CI oficial: lint, TypeScript, build, Core, SERA e smoke de produção.
