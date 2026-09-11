# Endpoint #18 — telemetry attempt (2026-09-11)

Endpoint: `GET /api/analyses/risk-profile`  
Repo consumer audit: unchanged PASS / no known versioned frontend consumer.

## Production host discovery

| Item | Value |
|------|-------|
| TEAM | unknown (no Vercel CLI auth) |
| PROJECT | unknown (no project link on `isaeldaumas/HFA`) |
| Live app observed | `systemhfa.vercel.app` |
| Git linkage | Vercel Production deployments on **`system-hfa/HFA`**, not `isaeldaumas/HFA` |
| Probe (unauthenticated) | `GET https://systemhfa.vercel.app/api/analyses/risk-profile` → **401** `{detail:"Não autorizado"}` — route still present in live deployment |

## Requested 90-day log window

Consultation moment: **2026-09-11T15:03:00Z** (approx.)

```text
START=2026-06-13T15:03:00Z
END=2026-09-11T15:03:00Z
FILTER=/api/analyses/risk-profile
```

```text
TEAM=
PROJECT=
ENVIRONMENT=
START=2026-06-13T15:03:00Z
END=2026-09-11T15:03:00Z
FILTER=/api/analyses/risk-profile
TOTAL_MATCHES=
STATUS_BREAKDOWN=
FIRST_SEEN=
LAST_SEEN=
```

## Classification

```text
ENDPOINT_EXTERNAL_TELEMETRY=BLOCKED_EXTERNAL
REASON=No Vercel credentials locally; isaeldaumas/HFA has no Vercel Git deployments; production logs would live under system-hfa/HFA Vercel project which is inaccessible without team token/login; no Datadog/Sentry/PostHog/log-drain keys present in env examples; GitHub Deployments API on isaeldaumas empty.
AVAILABLE_WINDOW=none (historical request logs not queryable from this environment)
OBSERVED_TRAFFIC=UNAUTHENTICATED_PROBE_ONLY (single 401 at consultation time; not a 90d series)
KNOWN_EXTERNAL_CONSUMERS=UNKNOWN
UNVERSIONED_CONSUMER_INVENTORY=NOT_DONE (requires human inventory)
```

**Do not remove endpoint.** Absence of accessible logs ≠ zero consumers.
