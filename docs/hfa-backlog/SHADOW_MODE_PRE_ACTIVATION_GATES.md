# Shadow Mode — Gates Pré-Ativação

**Status**: `SHADOW_FLAGS_OFF` — shadow mode permanece inativo
**Criado em**: 2026-09-10
**Restrição ativa**: nunca ativar sem decisão formal

---

## Estado atual

Todos os flags de shadow mode estão OFF:

| Flag | Valor |
|------|-------|
| `SERA_SHADOW_EXECUTION_ENABLED` | `false` |
| `SERA_SHADOW_PERSISTENCE_ENABLED` | `false` |
| `SERA_SHADOW_ADMIN_VIEW_ENABLED` | `false` |
| `SERA_SHADOW_AUTO_COMPARISON_ENABLED` | `false` |
| `SERA_SHADOW_VALIDATION_REPORTS_ENABLED` | `false` |

Verificado pelo teste `shadow-mode-trial-001.ts` (suite HFA).

## Arquitetura shadow mode

Descrita em: `docs/auditoria-hfa/terceira-etapa/05-arquitetura-shadow-mode.md`

O shadow mode executa o motor vNext em paralelo ao legado, persiste os resultados em tabela
separada (`sera_shadow_results`), e permite comparação sem afetar o output ao usuário.

## Gates obrigatórios antes de ativar qualquer flag

### Gate 1 — Isolamento de tenant
- [ ] `tenant-isolation-contract-trial-001.ts` passando (✅ já passa)
- [ ] `get_tenant_id()` JWT claim validado em dev/staging (ver JWT_RLS_TECHNICAL_FINDINGS.md)
- [ ] Fixture de tenant isolada criada e validada

### Gate 2 — Integridade do motor vNext
- [ ] Todos 159 casos determinísticos passando no CI (✅ já passa)
- [ ] Naturalistic gate `NOT_READY` → precisa chegar a `VALIDATION_PASS` primeiro

### Gate 3 — Observabilidade
- [x] Contrato versionado `SERA_SHADOW_DIVERGENCE_V1` (igualdade literal P/O/A; ERC excluído)
- [x] Métricas agregadas (`exactTripletMatch`, agreementRate sobre denominador comparável)
- [x] Dashboard administrativo somente leitura (fail-closed; flags OFF)
- [x] Endpoint admin tenant-scoped (404 com flag OFF)
- [ ] Alertas de divergência em runtime (ainda não — requer ativação controlada futura)

### Gate 4 — Rollback
- [x] Procedimento de rollback documentado (`sera-shadow/rollback.ts`)
- [x] Tempo máximo de rollback: < 5 minutos (env flip + restart)
- [x] Flag de desativação emergencial testado (`shadow-mode-trial-003-rollback.ts`)

### Gate 5 — Aprovação formal
- [ ] Todos os gates anteriores passando
- [ ] Revisão metodológica do autor
- [ ] Autorização explícita por escrito

## Quando Gate 5 estiver aprovado

Ativar somente `SERA_SHADOW_EXECUTION_ENABLED=true` inicialmente.
Verificar persitência e comparação por período mínimo (TBD).
Só então ativar os demais flags progressivamente.

## O que NÃO fazer

- Não ativar shadow mode parcialmente sem completar todos os gates
- Não ativar em produção antes de validação em staging
- Não usar shadow results para decisões de produto antes de validação naturalística
- Não persistir shadow results de usuários reais sem consentimento/LGPD

## Matriz de gates (#13) — pós-merge main

| Gate | State |
|------|-------|
| TENANT_ISOLATION | PASS |
| TECHNICAL_INTEGRITY | PASS |
| NATURALISTIC_VALIDATION | NOT_READY |
| OBSERVABILITY (activation) | NOT_READY / INFRA=PASS |
| ROLLBACK_LT_5_MIN | PASS |
| FORMAL_AUTHOR_APPROVAL | AUTHOR_PENDING |

Activation runbook (not executed): `SHADOW_ACTIVATION_RUNBOOK_20260911.md`  
```text
SHADOW_OBSERVATION_MINIMUM=AUTHOR_DECISION_PENDING
```

## Próximos passos

1. Manter flags OFF
2. Completar naturalistic human gate quando casos/reviewers existirem
3. Obter autorização autoral explícita antes de qualquer ativação
4. Não ativar em produção sem autorização separada
