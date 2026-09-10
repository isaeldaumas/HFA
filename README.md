# HFA — Human Factors Analysis

Sistema de análise de fatores humanos para investigação de eventos de segurança operacional.

---

## HFA current state

### Repositório canônico

`isaeldaumas/HFA` — https://github.com/isaeldaumas/HFA

### Estado da reconstrução

A terceira etapa do projeto foi **reconstruída e verificada** a partir do estado local preservado.

- **Reconstrução canônica termina em**: `f4d64793d8b8cd8c903c44daeffb769fa1932f35`
- **SHAs históricos originais não recuperados**:
  - `86358641f8c3763ac2401f6b8df2a60afc1b7ab0`
  - `60e171428e7f9067f67980f632d49499af704a79`
- **Resultado formal**: `THIRD_STAGE_VERIFIED_STATE_RECONSTRUCTED_WITH_NEW_GIT_HISTORY`
- **NÃO declarar**: `ORIGINAL_COMMITS_RECOVERED`

Documento de proveniência:
`docs/auditoria-hfa/terceira-etapa/RECONSTRUCTION_PROVENANCE.md`

### Limites operacionais ativos

| Flag | Estado |
|------|--------|
| Migration remota (Supabase) | `NO_REMOTE_MIGRATION` |
| Deploy | `NO_DEPLOY` |
| Validação em produção | `NO_PRODUCTION_VALIDATION` |
| Cross-tenant real | `NO_REAL_CROSS_TENANT_VALIDATION` |
| Shadow flags | `SHADOW_FLAGS_OFF` |

### SERA vNext

- **vNext**: NÃO autorizado para produção
- **Gate naturalístico**: `NOT_READY`
- **Shadow mode**: OFF
- **D3 ERC**: pendente de decisão formal
- **D4 taxonomia**: pendente de harmonização versionada
- **JWT/RLS real**: `get_tenant_id()` — claim JWT não populado; pendente validação em dev/staging
- **Cross-tenant real**: pendente de fixture isolada de tenant dev

### Estrutura do projeto

```
/
├── frontend/          # Next.js 16 — interface web principal
├── backend/           # FastAPI — API de análise
├── tests/
│   ├── hfa-audit/     # 5 suites HFA (erc-containment, legacy-freeze, shadow-mode, tenant-isolation)
│   └── sera-vnext/    # 205 casos SERA vNext (161 determinísticos, 44 ambientais)
├── scripts/           # Runners de regressão
├── docs/              # Documentação metodológica e de auditoria
└── supabase/          # Migrations locais (NÃO aplicadas remotamente)
```

### CI

| Workflow | Trigger | Estado |
|---------|---------|--------|
| HFA Core CI | PR/push main | Em configuração |
| SERA vNext Deterministic Regression | PR/push main | Em configuração |
| HFA Integrated Regression | workflow_dispatch (manual) | `INTEGRATED_REGRESSION_WORKFLOW_READY_ENVIRONMENT_NOT_CONFIGURED` |

### Branches preservadas

- `recovery/local-untracked-20260910` — cofre de artefatos locais pré-reconstrução; **NÃO fazer merge em main**
- `reconstruction/third-stage-verified-20260710` — estado verificado da terceira etapa

---

> **Este projeto NÃO está pronto para produção.**
> Limites metodológicos, de validação e de dados estão ativos conforme documentado acima.
