# Registration Turnstile pre-activation gate — 2026-11-11

This proposal is **not** a release authorization. It builds on the draft email-invitation registration PR #120 and remains separate from `main`.

## Implemented in the proposal

- Browser Turnstile widget, with public `NEXT_PUBLIC_HFA_TURNSTILE_SITE_KEY`.
- Server-side mandatory Cloudflare Siteverify using secret `HFA_TURNSTILE_SECRET_KEY`, with 5-second timeout, strict `success=true` and expected canonical hostname match.
- Missing secret, missing token, failed/expired/replayed token, wrong hostname, provider outage, and HTTP errors all deny registration **before tenant/Auth writes**.
- `HFA_REGISTRATION_INVITES_READY` remains disabled unless explicitly configured.
- Tested with deterministic local mocks; no real email, credential or user was created.

## Not yet satisfied — must stay in draft

1. Implement a distributed, atomic rate limit by normalized email and trustworthy client IP before enabling invitations. Avoid trusting arbitrary forwarded headers or instance-local memory. Include parallelism/NAT tests and quota/abuse monitoring.
2. Verify the Turnstile widget sitekey/domain and secret using an authorized end-to-end test, plus a server-side Siteverify failure test. Mock tests are **not** provider homologation.
3. Verify Supabase invite email delivery, allowlisted redirect and accepted-invite account setup with controlled mailboxes, plus recovery/timeout paths.
4. Reconcile historical Supabase migrations and apply `disable_signup`/email confirmation policy through the hosted project configuration, preserving existing users and login. Test direct `/auth/v1/signup` bypass independently.
5. Resolve provisional tenant / orphan Auth identity compensation, credential renewal, trial policy and authenticated two-tenant isolation.
6. Run clean CI and review provider/dependency configuration. Do not deploy or promote scientific engines as part of this change.

The Siteverify challenge is an **anti-bot layer**, not a substitute for rate limiting or email ownership validation.
