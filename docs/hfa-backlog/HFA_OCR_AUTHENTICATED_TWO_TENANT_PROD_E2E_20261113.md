# HFA #122 — authenticated two-tenant production E2E (2026-11-13 UTC)

## Scope and authorization

Explicit production authorization was supplied by the project owner. No preexisting production tenant, event, user or document was reused or modified. Both organizations, analyst accounts, event records, private PNG originals and OCR review records were synthetic and disposable.

Target: https://systemhfa.vercel.app, HFA main 72d8dd7a84e41706af8579e703a9e4bf1a4679ff. Normal bearer authentication, production tenant-scoped routes and Supabase private Storage were exercised. Explicit approval guards must be present for synthetic fixtures, production mutations, read-only checks, fixture type and hostname.

## Execution results

- Initial trial with legacy public user ID different from the authentication ID: all own/cross routes returned 403; no bypass or policy weakening. Cleanup verified.
- Second trial with canonical direct binding (public.users.id = auth.users.id): both principals authenticated.
- Event isolation: 6/6 pass; own tenant list/event GET 200, cross-tenant event GET 404.
- Document isolation: 6/6 pass; own document manifest GET 200 contained own document ID, cross-tenant list and download GET 404.
- Additional diagnostic requests independently matched 200 on own resources and 404 on foreign resources for both tenants.
- Each tenant successfully POSTed a review, received HTTP 201 and a persisted authenticated receipt; identical retry returned 200 already_present, same receipt ID. Historical GET returned only metadata. Cross-tenant review GET/POST returned 404 and forged source SHA-256 returned 409.
- Exactly two synthetic review rows temporarily existed. Finally cleanup removed source indexes, private Storage blobs, events, public users, Supabase Auth accounts and tenants. Unique-ID checks verified no residue; independent production aggregate checks confirmed original counts: 8 tenants, 8 public users, 56 events, 0 documents, 0 OCR reviews.

No client data, actual event analysis, AI provider or scientific SERA mutations were involved.

## Reproduction and safety

Harness: frontend/tools/run-two-tenant-ocr-synthetic-production-e2e.mjs and two read-only inspectors. Requires approved production credentials in an OUT-OF-REPO env file, synthetic PNG and exact production hostname. No passwords, tokens, private document content or user emails are logged. Recovery checkpoint contains disposable IDs only, mode 0600. Exit code nonzero on verification or cleanup failure. Never commit credentials, production env files or bearer tokens.

A defect in the read-only document inspector rejected normal numeric Content-Length, due to an extra regex escape. Fixed and covered with positive and negative Content-Length regression tests. This affects test tooling, not production runtime authorization.

## Limitations

Validates synthetic PNG source isolation and persistence; not representative real-world OCR accuracy, complete heterogeneous 3–5-source capture or clinical/investigative veracity. PDF page numbering remains a client claim in the persisted record. Keep issue #122 OPEN pending a consented representative corpus, calibration and complete acceptance verification.
