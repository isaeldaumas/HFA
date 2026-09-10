# Risk-profile endpoint consumer audit (#18)

Date: 2026-09-10  
Endpoint: `GET /api/analyses/risk-profile`  
Status: **DO NOT REMOVE** — external consumer confirmation incomplete

## Versioned consumers

| Surface | Uses `/api/analyses/risk-profile`? | Notes |
|---------|------------------------------------|-------|
| Dashboard UI | No | uses `/api/risk-profile` |
| Events UI | No | exclusions via `/api/risk-profile/exclusions` |
| Executive reports | No | uses `/api/risk-profile` |
| Org intelligence | Deprecated alias | points consumers to `/api/risk-profile` |
| Endpoint itself | Present | delegates/deprecates toward canonical service |
| Tests | Parity trial probes legacy path | `risk-profile-endpoint-parity-real-trial-001.ts` |
| Docs | Multiple historical references | backlog / opus matrices |

**Conclusion (code):** no current versioned frontend product consumer was found calling `/api/analyses/risk-profile`.  
This does **not** prove absence of external callers.

## External / telemetry confirmation still required

- Staging/production access logs for last 90 days (not available in this phase / not queried)
- Non-repo scripts, bookmarks, partner integrations
- Formal deprecation window announcement before deletion

## Decision gate to close #18

Issue #18 may close only after:

1. telemetry/log inventory (or explicit authorial waiver that logs are unavailable and residual risk accepted)
2. documented deprecation window
3. authorial approval to remove or permanently keep as shim

Until then: keep endpoint, keep deprecation messaging, do not alter behavior beyond already-merged consolidation.
