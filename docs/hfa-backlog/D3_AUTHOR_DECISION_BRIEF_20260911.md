# D3 — Author decision brief (ready for signature)

```text
D3=AUTHOR_DECISION_PENDING
PR_47_DEPENDS_ON_D3=NO
```

PR #47 is Shadow preparatory comparison only (ERC explicitly excluded). It does **not** require D3.

## Recommended option: D3-b

```text
- nenhum ERC numérico canônico novo para vNext;
- ERC histórico legado preservado com provenance;
- UNRESOLVED nunca gera ERC;
- perfil misto não mostra ERC numérico consolidado;
- ausência deliberada de ERC vNext não reduz artificialmente data-confidence.
```

## Before → after (if approved)

| Surface | Before (today) | After D3-b |
|---------|----------------|------------|
| `erc-containment.ts` | Labels mechanisms; consolidated view disabled by default | Keep; assert no unlabeled vNext numeric ERC escape |
| `risk-profile/server.ts` | May aggregate ERC across mixed sources; feeds `validErcCount` | Mixed: no consolidated numeric ERC indicator; UNRESOLVED → no ERC |
| `data-confidence.ts` | Lower confidence when `validErcShare < 0.8` | Deliberate vNext ERC absence must not alone force penalty when containment applies |
| UI risk / events | Shows described heuristic ERC | Fail-closed copy for mixed / pure vNext |
| APIs `/api/risk-profile`, org intelligence, analyses shim | Return ERC aggregates | Align fail-closed; **keep** analyses shim |
| Persistence | Historical `erc_level` | Preserve with provenance; no rewrite |
| Tests | erc-containment trials | Add mixed / UNRESOLVED / pure-vNext cases |

## Files likely to change (implementation only after approval)

- `frontend/src/lib/risk-profile/erc-containment.ts`
- `frontend/src/lib/risk-profile/server.ts`
- `frontend/src/lib/sera/data-confidence.ts` (and callers)
- Risk profile / event UI consuming ERC
- `tests/hfa-audit/erc-containment/*`

## Risks

- Under-communicating risk if UI hides numbers without clear provenance messaging
- Over-fitting data-confidence exceptions
- Touching deprecated analyses endpoint behavior accidentally (forbidden without separate #18 decision)

## Approval text (author must paste explicitly)

> Aprovo D3-b como decisão autoral do HFA/SERA vNext: sem ERC numérico canônico no vNext até mecanismo validado/versionado; históricos legados preservados com proveniência; UNRESOLVED não gera ERC; perfil misto não apresenta ERC numérico como indicador consolidado.

Detail map: `D3B_TECHNICAL_IMPACT_MAP_20260911.md`.
