# Staging Security Advisor review (HFA `vbdpweliprcsktyxodss`)

Date: 2026-09-10  
Scope: post Auth/RLS hardening; staging only  
`PRODUCTION_NOT_TOUCHED`

## Findings

| Finding | Level | Disposition |
|---------|-------|-------------|
| `analyses_backup_pt_en` RLS enabled, no policy | INFO | **Intentional** — closed to clients; service-role only |
| `sera_document_uploads` RLS enabled, no policy | INFO | **Do not add permissive policy** until usage audit decides owner/access model |
| Leaked password protection disabled | WARN | Separate staging Auth config decision; may affect synthetic fixtures if enabled without password policy alignment |

## Actions taken in this phase

- Confirmed no P0 metadata/RLS advisories remain for the Auth/RLS scope
- Documented intentional no-policy tables
- Did **not** enable leaked-password protection automatically (fixture impact unknown without controlled retest)

## Follow-ups (non-blocking)

1. Usage audit for `sera_document_uploads` before any policy creation
2. Controlled staging experiment for HaveIBeenPwned leaked-password protection with Auth A/B fixture passwords re-verified afterward
