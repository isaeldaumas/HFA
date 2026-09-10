# NPM Audit Triage — HFA frontend (sanitized)

Date: 2026-09-10  
Scope: `frontend/` (`package-lock.json`)  
Method: `npm audit --json` (no secrets; no `--force`)  
Project: isaeldaumas/HFA (public)

## Baseline (before remediation)

```text
21 vulnerabilities
4 low / 5 moderate / 11 high / 1 critical
```

## CRITICAL treated first

| Package | Direct? | Runtime? | Fix | Breaking? | Action |
|---------|---------|----------|-----|-----------|--------|
| `next` `16.2.5` | direct | runtime | `16.3.4` | no (semver minor/patch within 16.x) | bump in dedicated PR |

`next` also carried multiple HIGH/MODERATE advisories closed by the same bump.

## Remaining after `next@16.3.4` (expected)

```text
17 vulnerabilities
4 low / 5 moderate / 8 high / 0 critical
```

## HIGH inventory (post-critical)

| Package | Direct? | Likely surface | Fix available | Notes |
|---------|---------|----------------|---------------|-------|
| `@xmldom/xmldom` | transitive | dep graph | yes | isolate parent; prefer minimal pin |
| `brace-expansion` | transitive | tooling | yes | usually non-runtime HTTP |
| `browserslist` | transitive | build | yes | typically build-time |
| `fast-uri` | transitive | tooling | yes | inspect parent |
| `hono` | transitive | if present in API tooling | yes | confirm consumer path |
| `ip-address` | transitive | tooling | yes | |
| `js-yaml` | transitive | build/test | yes | |
| `nanoid` | transitive | mixed | yes | evaluate runtime reachability |
| `postcss` | transitive via next | build/runtime SSR assets | tied to next (addressed) | re-check after next bump |
| `sharp` | transitive via next | image opt | tied to next (addressed) | re-check after next bump |
| `ws` | transitive | realtime/tooling | yes | |

## Policy

- Never `npm audit fix --force`
- One cohesive dependency change per PR
- Required checks: HFA Core CI + SERA vNext Deterministic Regression
- If a HIGH requires major/breaking change: open a package-specific issue and leave documented residual risk

## Residual risk process

For each remaining HIGH after safe bumps:

1. identify parent package path (`npm ls <pkg>`)
2. classify runtime vs dev-only
3. apply minimal override/pin only when safe
4. otherwise document `wontfix`/`deferred` with exploitability rationale for HFA (Next.js SSR app, not public CLI)
