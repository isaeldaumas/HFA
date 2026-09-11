# D3-b — Technical impact map (no implementation)

Status: `D3=AUTHOR_DECISION_PENDING`  
Recommendation known: **D3-b** (no canonical numeric ERC for vNext yet; preserve legacy ERC with provenance; UNRESOLVED never yields ERC; mixed profile no consolidated numeric ERC; no artificial data-confidence penalty solely because ERC is deliberately contained).

**This document does not approve D3-b.** No new ERC formula. No thresholds invented.

## Where D3 would touch code today

| Area | Path | Current behavior | D3-b delta (if approved) |
|------|------|------------------|--------------------------|
| Containment registry | `frontend/src/lib/risk-profile/erc-containment.ts` | Labels mechanisms; consolidated view disabled by default; D3 doc referenced | Keep; possibly harden “no vNext numeric ERC escape” assertions |
| ARMS matrix | `frontend/src/lib/risk-profile/erc.ts` | Legacy/heuristic matrix from P/O/A codes | Remains legacy-provenance only; never silently become vNext canonical |
| Risk profile aggregate | `frontend/src/lib/risk-profile/server.ts` | Builds `modal_erc_level`, `erc_distribution`, MIXED_VERSION_LIMITATION text; feeds `validErcCount` into data confidence | Mixed profile: suppress consolidated numeric ERC presentation; ensure UNRESOLVED axes contribute 0 ERC |
| Data confidence | `frontend/src/lib/sera/data-confidence.ts` | Level drops when `validErcShare < 0.8` | Must not treat deliberate vNext ERC absence as quality failure when D3-b containment applies |
| Legacy motor ERC | `analyses.erc_level` / motor heuristic | Historical values | Preserve with mechanism provenance via `describeErcValue` |
| UI risk profile / events | dashboard & event report surfaces using `describeErcValue` | Display labeled heuristics | Fail-closed copy for mixed/vNext-only; no fake consolidated number |
| APIs | `/api/risk-profile`, `/api/org/intelligence`, `/api/analyses/risk-profile` | Return profile fields including ERC aggregates | Align response contracts fail-closed; **do not remove** deprecated analyses path in D3 work |
| Reports | event report paths | Uses containment labels | Same |
| Persistence | historical `erc_level` columns | Untouched | No rewrite of history |
| Tests | `tests/hfa-audit/erc-containment/*` | Containment trials | Extend for mixed/UNRESOLVED/vNext-only after author approval |

## Explicit non-goals until approval

- Inventing a new ERC formula
- Declaring a canonical numeric ERC for vNext
- Merging methodological D3 into `main` as “done”
- Changing production env

Required author text (or unequivocal equivalent) before implementation merge remains the D3-b approval sentence recorded in `D3_D4_AUTHOR_DECISION_BLOCK_20260911.md`.
