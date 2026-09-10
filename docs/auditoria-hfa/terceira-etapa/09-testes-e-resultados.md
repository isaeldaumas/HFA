# Testes e Resultados — Terceira Etapa

## Comandos executados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (frontend) | **PASS** — 0 erros (antes e depois das alterações) |
| `npm run lint` (frontend) | **PASS** — 0 erros, 22 warnings (mesmos pré-existentes; 0 novos) |
| `npm run build` (frontend) | **PASS** |
| Regressão vNext segura (161 trials sem infraestrutura externa) | **161 PASS / 1 NOT_READY (esperado) / 43 SKIP_ENV** — idêntico à linha de base da 1ª etapa |
| 5 suítes de teste isolado desta etapa (`tests/hfa-audit/`) | **5/5 PASS** |

## Suítes novas desta etapa (isoladas, fora do manifesto oficial)

| Suíte | Resultado | Cobre |
|---|---|---|
| `erc-containment-trial-001.ts` | PASS (12/12 asserções) | Registro de mecanismos, `describeErcValue`, flag de contenção |
| `erc-containment-trial-002-static.ts` | PASS (5/5 asserções) | Contrato estático: funções mortas não religadas, telas usam contenção |
| `legacy-freeze-trial-001.ts` | PASS (7/7 asserções) | Avisos de congelamento + tripwire de matriz/códigos |
| `shadow-mode-trial-001.ts` | PASS (6/6 asserções) | Flags desligadas por padrão + no-op seguro |
| `tenant-isolation-contract-trial-001.ts` | PASS (12/12 cenários) | Isolamento entre tenants (F-01) |

## Achado durante a execução: 8 trials oficiais falharam temporariamente

Ao tocar arquivos dentro de `frontend/src/lib/sera/` (para os avisos de congelamento), 8 trials
pré-existentes do manifesto oficial falharam:

`human-pilot-preparation-integrity-trial-001`, `isolated-fixture-candidates-a4r212big-trial-001`,
`mega-freeze-readiness-boundary-a4r213-trial-001`, `official-fixture-set-a4r214max-trial-001`,
`product-beta-integrity-trial-001`, `risk-profile-integrity-trial-001`,
`runtime-module-a4r220max-trial-001`, `runtime-readiness-a4r216max-trial-001`.

**Causa raiz:** todos usam `git diff --name-only`/`--cached` para afirmar "nada em
`frontend/src/lib/sera/` está alterado no working tree" — uma checagem de fases anteriores da
governança vNext (A4R212 a A4R224), não um teste de comportamento. **Confirmado**: após os
commits desta etapa (working tree limpo para esses arquivos), os 8 voltam a passar — verificado
individualmente e depois confirmado na regressão completa final (ver abaixo). Não foi feita
nenhuma alteração nesses 8 arquivos de teste.

## Regressão completa final (pós-commits)

Executada do zero após todos os 7 commits de código/teste desta etapa:

```
SUMMARY {"PASS":161,"SKIP_ENV":43,"NOT_READY":1}
```

- **0 FAIL** (confirmado por contagem: `grep -c "^FAIL"` = 0).
- Os 8 trials que haviam falhado durante o desenvolvimento (working tree sujo) **passam** nesta
  execução final (working tree limpo).
- Resultado **idêntico** à linha de base medida na primeira etapa desta auditoria
  (161 PASS / 43 SKIP_ENV / 1 NOT_READY) — nenhuma regressão introduzida.

## Limitações do ambiente (reafirmadas)
- 43 trials `REAL_DB`/`REAL_API`/`REAL_UI` continuam pulados por exigirem Supabase real e/ou
  servidor local rodando — mesma limitação da 1ª/2ª etapa.
- A migration foi validada contra um Postgres local descartável, não contra Supabase real (ver
  `08-migrations.md`).
- Nenhum teste com LLM real foi executado (comportamento não determinístico, sem chaves
  configuradas neste ambiente).
