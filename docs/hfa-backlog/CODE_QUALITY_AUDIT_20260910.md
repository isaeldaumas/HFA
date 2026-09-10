# Auditoria de Qualidade de Código — 2026-09-10

**Status**: Classificação inicial sem alteração de comportamento
**Escopo**: `frontend/src/`

---

## P0 — Segurança/Dados

Nenhum achado P0 novo identificado nesta auditoria.

Achados de segurança já rastreados:
- JWT/RLS claim pendente (ver `JWT_RLS_TECHNICAL_FINDINGS.md`, issue #9)
- Cross-tenant validation real pendente (issue #11)

---

## P1 — Arquitetura/Correção

### P1-01: Dois mecanismos ERC incompatíveis coexistentes
**Severidade**: P1 (contenção ativa, mas divergência reproduzível)
**Arquivos**: `lib/risk-profile/erc.ts`, `lib/sera/erc-modal.ts`, `lib/risk-profile/erc-containment.ts`
**Já rastreado**: D3 ERC (issue #7)
**Ação**: aguardar decisão D3

### P1-02: Endpoint DEPRECATED não removido
**Severidade**: P1 (endpoint legado pode confundir clientes)
**Arquivo**: `app/api/analyses/risk-profile/route.ts`
**Detalhe**: marcado como DEPRECATED, delega ao canônico `/api/risk-profile`. Não causa problema imediato mas deve ser removido após confirmar que nenhum cliente o usa.
**Ação**: auditar clientes antes de remover

### P1-03: Fragmentação código↔rótulo↔eixo em 3+ arquivos
**Severidade**: P1 (manutenção e consistência)
**Arquivos**: `lib/sera/failure-names.ts`, `lib/sera/hfacs-mapper.ts`, `lib/sera/canonical-codes.ts`
**Já rastreado**: D4 taxonomia (issue #8)
**Ação**: aguardar decisão D4

### P1-04: TODOs metodológicos em vNext
**Severidade**: P1 (funcionalidade incompleta declarada)
**Arquivos**:
- `lib/sera-vnext/steps/07-preconditions.ts:4` — TODO derive from evidence
- `lib/sera-vnext/steps/08-limitations.ts:4` — TODO derive from evidence
- `lib/sera-vnext/steps/09-recommendations.ts:8` — TODO produce only from validated findings
**Detalhe**: referenciados como A4+R-33. São limitações conhecidas do vNext, não bugs. Motor vNext não está em produção.
**Ação**: documentar como limitações vNext, resolver após naturalistic gate

---

## P2 — Escalabilidade/Manutenção

### P2-01: Arquivos grandes com múltiplas responsabilidades
**Severidade**: P2
**Arquivos**:
- `lib/sera/all-steps.ts`: 3926 linhas (motor legado completo — congelado)
- `lib/sera/pipeline.ts`: 2405 linhas
- `app/(dashboard)/risk-profile/page.tsx`: 2108 linhas
**Detalhe**: `all-steps.ts` e `pipeline.ts` são motor legado congelado — NÃO refatorar sem testes.
`risk-profile/page.tsx` é um candidato a split em componentes menores.
**Ação**: P2 na fila; `risk-profile/page.tsx` pode ser split em componentes (sem alterar lógica)

### P2-02: Console logs em rotas de API (33 ocorrências)
**Severidade**: P2 (em produção gera ruído no logger)
**Ação**: substituir por logger estruturado; verificar que nenhum loga dados sensíveis (verificado: não loga)

### P2-03: `package-lock.json` estava desatualizado
**Severidade**: P2 (causou falha no CI)
**Status**: RESOLVIDO — atualizado no commit `f87243e`

### P2-04: Vulnerabilidades npm
**Severidade**: P2 (21 vulnerabilidades: 4 low, 5 moderate, 11 high, 1 critical)
**Detalhe**: reportado por `npm audit`. Algumas podem ser false positives em dependências de dev.
**Ação**: rodar `npm audit --json` e triagear. Não usar `--force` sem review manual.

---

## P3 — Limpeza

### P3-01: `risk-quality-trend.ts` e `erc-modal.ts` marcados DEPRECATED mas ainda presentes
**Severidade**: P3 (dead code intencional por segurança — ERC containment exige que existam para referência)
**Ação**: remover somente após D3 decidido e contenção ERC atualizada

### P3-02: `SERA_DEBUG_OBJECTIVE` env var hardcoded em all-steps.ts
**Arquivo**: `lib/sera/all-steps.ts:2691`
**Detalhe**: `if (process.env.SERA_DEBUG_OBJECTIVE === '1')` — flag de debug no motor legado congelado
**Ação**: P3 — motor congelado, não alterar

### P3-03: `package 2.json` em frontend/
**Arquivo**: `frontend/package 2.json` (com espaço no nome)
**Detalhe**: arquivo órfão/duplicado que não deve existir
**Ação**: verificar se é backup e remover se for

---

## Verificações com resultado OK

| Verificação | Resultado |
|-------------|-----------|
| TypeScript strict | ✅ Zero erros |
| `any` type annotations | ✅ Zero |
| `as any` casts | ✅ Zero |
| Secrets em código | ✅ SECRET_SCAN_PASS |
| Credentials inline em remotes | ✅ CLEAN_URL |
| tenant_id vindo de body/query | ✅ Nenhum encontrado |
| Rotas admin sem auth | ✅ Todas usam requireAdmin |
| Shadow flags em CI | ✅ Todos false |

---

## Próximos PRs sugeridos (por prioridade)

1. **P2-03**: Verificar `package 2.json` e remover se órfão
2. **P2-04**: Triagem de vulnerabilidades npm (branch separado)
3. **P2-02**: Substituir console.log por logger estruturado (branch separado, sem alterar lógica)
4. **P1-02**: Auditar clientes do endpoint deprecated antes de remover
5. **P2-01**: Split de `risk-profile/page.tsx` em componentes (após CI verde)
