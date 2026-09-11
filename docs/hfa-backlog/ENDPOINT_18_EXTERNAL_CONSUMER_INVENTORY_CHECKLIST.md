# Endpoint #18 — external consumer inventory checklist (human)

Endpoint: `GET /api/analyses/risk-profile`  
Repo audit: PASS (no known versioned frontend consumer)  
Telemetry: `BLOCKED_EXTERNAL` until Vercel/`system-hfa` logs accessible  

```text
EXTERNAL_CONSUMER_INVENTORY=NOT_STARTED
ENDPOINT_REMOVAL_AUTHORIZED=NO
```

Zero git references ≠ complete external inventory.

## Human confirmation required

For each item, responsible person marks YES / NO / UNKNOWN with date and initials. Do not infer.

| Surface | Present? | Notes / evidence pointer |
|---------|----------|--------------------------|
| Postman collections | | |
| Insomnia collections | | |
| Personal scripts | | |
| Operations scripts | | |
| Dashboards | | |
| Partner integrations | | |
| External clients | | |
| Legacy integrations | | |
| Browser bookmarks | | |
| Cron jobs | | |
| Internal tools | | |
| Non-versioned docs / wikis | | |
| Automations (Zapier/Make/etc.) | | |

## Telemetry unlock (external)

```text
REQUIRED_EXTERNAL_ACCESS:
- login/token with access to Vercel team/project for system-hfa / systemhfa.vercel.app
- log source with sufficient retention
- then fill START/END/TOTAL_REQUESTS/status breakdown (aggregated only)
```

Attempt 2026-09-11 (this phase): `vercel whoami` → no credentials; no HFA `.vercel/project.json`.

## Removal gate (future PR only)

Requires simultaneously:

```text
REPO_AUDIT=PASS
TELEMETRY_EVIDENCE=SUFFICIENT
EXTERNAL_INVENTORY=COMPLETE
DEPRECATION_WINDOW=DEFINED
AUTHOR_APPROVAL=PASS
```
