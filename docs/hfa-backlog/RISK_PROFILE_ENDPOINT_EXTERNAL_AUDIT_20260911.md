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

Attempted 2026-09-11 continuation (no ZIP search; no behavior change to endpoint).

```text
PROJECT=
TEAM=
ENVIRONMENT=
START=
END=
QUERY=/api/analyses/risk-profile
REQUEST_COUNT=
STATUS_CODES=
LAST_SEEN=
```

| Field | Value |
|-------|-------|
| PROJECT | (empty) — blocked |
| TEAM | (empty) — blocked |
| ENVIRONMENT | (empty) — blocked |
| START / END | intended last 90 days — **not queried** |
| QUERY | `/api/analyses/risk-profile` |
| REQUEST_COUNT | (empty) — not queried |
| STATUS_CODES | (empty) — not queried |
| LAST_SEEN | (empty) — not queried |
| Blockers | no `.vercel/project.json`; `vercel` CLI token invalid; GitHub Deployments API empty; no versioned Postman/bookmarks |

Status: **ENDPOINT_EXTERNAL_TELEMETRY=BLOCKED_EXTERNAL**

Absence of access ≠ zero calls. Zero calls (if later observed) ≠ proof of zero non-logged consumers.

## Human inventory still required (non-repo)

- Partner integrations, local scripts, dashboards, Postman collections, bookmarks, runbooks outside git
- Formal deprecation window + author approval before any removal

## Gate

`ENDPOINT_EXTERNAL_TELEMETRY=BLOCKED_OBSERVABILITY`  
Removal remains **NOT_AUTHORIZED**.
