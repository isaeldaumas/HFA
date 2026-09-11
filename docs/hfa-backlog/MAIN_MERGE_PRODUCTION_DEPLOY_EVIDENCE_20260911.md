# MAIN → production deploy coupling (2026-09-11)

Target repository for this work: **`isaeldaumas/HFA`** (`origin-hfa`).

```text
MAIN_MERGE_PRODUCTION_DEPLOY=NO
GITHUB_ACTIONS_MAIN_DEPLOY=NO
VERCEL_LINKED_TO_ISAELDAUMAS_HFA=NO
```

## Evidence (read-only)

### A. GitHub Actions on `isaeldaumas/HFA`

| Workflow | Trigger on `push` to `main` | Deploy steps |
|----------|----------------------------|--------------|
| HFA Core CI | yes | none (CI only) |
| SERA vNext Deterministic Regression | yes | none (CI only) |
| HFA Integrated Regression | `workflow_dispatch` only | none; staging confirmations |

### B. Empirical main history (`isaeldaumas/HFA`)

Sampled **10 consecutive commits** on `main` ending at `a71d244…`:

- `check-runs` app slug set = **`github-actions` only**
- Commit **statuses** = **empty** (no `Vercel` context)
- `GET /repos/isaeldaumas/HFA/deployments` = **`[]`**
- `GET /repos/isaeldaumas/HFA/hooks` = **`[]`**
- PR #47 has **no** `vercel[bot]` comments

If Vercel Git Integration were linked to this repo with Production Branch = `main`, merges would create Deployment records and/or `Vercel` status contexts. They do not.

### C. Where production Vercel actually is

| Item | Finding |
|------|---------|
| Live host | `https://systemhfa.vercel.app` → HTTP 200 |
| Dead host from docs | `https://hfa-omega.vercel.app` → `DEPLOYMENT_NOT_FOUND` |
| Linked GitHub repo | **`system-hfa/HFA`** (not `isaeldaumas/HFA`) |
| Latest Production deployment | id `5385083468`, creator `vercel[bot]`, sha `315eac1a47…`, at `2026-07-10T01:06:37Z` |
| `system-hfa/HFA` main tip (queried) | same family / at `315eac1…` |
| `isaeldaumas/HFA` main tip | `a71d244…` (many merges **after** 2026-07-10 **without** Vercel deployments on this repo) |

### D. Local / CLI

| Item | Finding |
|------|---------|
| `vercel.json` / `.vercelignore` | present (build config only) |
| `.vercel/project.json` | absent |
| `~/.vercel` | absent |
| `vercel whoami` | no credentials |
| Env files | no `VERCEL_*` / observability drain keys (names scanned only) |
| `render.yaml` / `backend/railway.json` | legacy **backend** service configs; not frontend Actions deploy; not triggered by documented GitHub workflows on this repo |

## Scope of the NO verdict

```text
MAIN_MERGE_PRODUCTION_DEPLOY=NO
```

means: **merging to `main` on `isaeldaumas/HFA` does not automatically publish production** via Actions or via a Vercel Git link on that repository.

It does **not** mean:

- production does not exist elsewhere (`systemhfa.vercel.app` is live and stale relative to isaeldaumas main);
- manually deploying, or pushing to `system-hfa/HFA`, is safe without authorization;
- production flags may be flipped.

## PR #47 implication

```text
READY_FOR_MERGE_TECHNICALLY=YES
BLOCKED_BY_PRODUCTION_AUTHORIZATION=NO_FOR_AUTO_DEPLOY
MERGE_STILL_REQUIRES_HUMAN_PRODUCT_CHOICE=YES
```

Shadow flags remain OFF; preparatory code only.
