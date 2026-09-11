# Risk-profile endpoint — external consumer audit refresh (#18)

Date: 2026-09-11  
Endpoint: `GET /api/analyses/risk-profile`  
Decision: **DO NOT REMOVE** · behavior unchanged in this continuation

## Repo / local re-scan (this session)

| Surface | Finding |
|---------|---------|
| Frontend product UI | No caller of `/api/analyses/risk-profile`; UI uses `/api/risk-profile` |
| API route | Still present (`frontend/src/app/api/analyses/risk-profile/route.ts`) — shim/compat |
| Tests | Parity probe in `risk-profile-endpoint-parity-real-trial-001.ts` |
| Docs / runbooks | Historical references only (opus matrices, risk docs) |
| `.vercel/project.json` | **Absent** — cannot bind projectId/orgId for log query from this checkout |
| `.env*` / Postman / bookmarks | No versioned Postman/bookmark exports found that call the path |
| CI/CD | No workflow that HTTP-calls the deprecated path as a product consumer |

**Repo conclusion:** no known versioned frontend consumer.  
**Does not prove** zero external consumers.

## Vercel / production telemetry (90 days)

| Field | Value |
|-------|-------|
| team/project | UNKNOWN — blocked |
| environment | production / staging / preview | UNKNOWN |
| window | last 90 days | NOT QUERIED |
| requestPath filter | `/api/analyses/risk-profile` | NOT QUERIED |
| call count / status codes / last call | N/A | BLOCKED_OBSERVABILITY |

Status: **BLOCKED_EXTERNAL** / **BLOCKED_OBSERVABILITY**

## Human inventory still required (non-repo)

- Partner integrations, local scripts, dashboards, Postman collections, bookmarks, runbooks outside git
- Formal deprecation window + author approval before any removal

## Gate

`ENDPOINT_EXTERNAL_TELEMETRY=BLOCKED_OBSERVABILITY`  
Removal remains **NOT_AUTHORIZED**.
