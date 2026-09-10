# Terceira Etapa — Resumo Executivo

**Branch:** `auditoria-hfa-terceira-etapa-20260710` (criado a partir de `auditoria-hfa-20260709`)
**HEAD inicial:** `315eac1a4728346dc893d6b09e7c9e91a4e000f6`
**Escopo:** contenções, infraestrutura de rastreabilidade, preparação de shadow mode.
**vNext NÃO foi promovido a produção.** Nenhuma fórmula ERC foi declarada canônica. Nenhuma
classificação histórica foi reinterpretada.

## O que esta etapa entrega

1. **Contenção do F-04** — os dois mecanismos ERC vivos (heurística do motor legado e matriz
   ARMS a partir dos códigos) agora se identificam explicitamente (mecanismo + versão + direção
   de escala) em todo lugar onde aparecem juntos, e uma cópia hardcoded duplicada da matriz ARMS
   foi eliminada (dedup, sem mudança de valor).
2. **Modelo de proveniência metodológica** — colunas aditivas em `analyses` e
   `sera_vnext_analyses` (`engine_id`, `generated_by_type`, `validation_status`, etc.), migration
   100% aditiva, validada de ponta a ponta contra uma instância Postgres local descartável (ver
   `08-migrations.md`).
3. **Identificação de motor na interface (F-14)** — componente `EngineProvenanceBadge` e rótulos
   equivalentes no relatório impresso, mostrando motor/versão/origem/status de validação.
4. **Congelamento formal do motor legado** — avisos inline nos arquivos que implementam a
   classificação e a matriz ERC do legado, mais um teste-tripwire que falha se a matriz ou os
   conjuntos de códigos canônicos crescerem sem decisão formal.
5. **Infraestrutura de shadow mode** — módulo `sera-shadow/` com 5 flags (todas desligadas por
   padrão), execução do motor vNext isolada e à prova de falhas, persistência em tabela dedicada
   append-only, nunca substituindo produção.
6. **Suíte automatizada de isolamento entre tenants** — 12 cenários da investigação F-01
   convertidos em contrato estático executável, que falha se uma rota/repositório futuro
   esquecer o filtro de tenant.

## Achado relevante descoberto nesta etapa

Ao tentar rodar a regressão oficial após as alterações, **8 trials pré-existentes falharam** —
todos por um mecanismo comum: testes de fases anteriores (`A4R212`, `A4R213`, `A4R214`,
`A4R216`, `A4R220`, `product-beta-integrity`, `human-pilot-preparation-integrity`,
`risk-profile-integrity`) verificam, via `git diff --name-only`, que **nada em
`frontend/src/lib/sera/` aparece como alterado no working tree**. Isso não é uma falha real de
comportamento — é uma checagem "zero-diff" que qualquer edição não commitada nesses arquivos
sempre vai disparar, mesmo uma mudança puramente de comentário. Confirmado experimentalmente:
após o commit, o working tree fica limpo e esses 8 trials voltam a passar (ver
`09-testes-e-resultados.md`). Registrado como observação em `10-riscos-residuais.md`: o
"congelamento" do motor legado já era parcialmente aplicado, de forma fragmentada, por vários
testes ad hoc de fases anteriores — não por um mecanismo único e documentado.

## Critérios de aceitação — status

| Critério | Status |
|---|---|
| ERC contraditório não é mais exibido como indicador consolidado | ✅ (rótulos de mecanismo em todos os pontos de exibição conjunta) |
| Nenhum dado histórico apagado ou reinterpretado | ✅ (migration aditiva; backfill só popula metadado novo com `unknown_legacy`) |
| Motor e versão identificáveis | ✅ (badge + linha no relatório + colunas no banco) |
| Sugestões de IA separadas de decisões validadas | ✅ parcial (rótulo `llm_suggestion` vs `validated`; separação completa depende de D1/D2) |
| Legado formalmente congelado | ✅ (avisos + tripwire test; sem mudança de comportamento) |
| Shadow mode preparado e desligado por padrão | ✅ (5 flags, todas false) |
| Resultados candidatos isolados da produção | ✅ (tabela dedicada, nunca escrita em `analyses`) |
| Testes cross-tenant automatizados | ✅ (12/12 cenários, contrato estático) |
| Taxonomia versionada preparada sem alteração semântica | ✅ (tabela vazia, códigos atuais não migrados) |
| Build/lint/typecheck/testes aprovados | ✅ (ver `09-testes-e-resultados.md`) |
| Nenhuma classificação histórica modificada | ✅ |
| Nenhuma fórmula ERC declarada canônica | ✅ |
