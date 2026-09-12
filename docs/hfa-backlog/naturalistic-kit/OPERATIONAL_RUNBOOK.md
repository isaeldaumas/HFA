# Naturalistic validation — operational runbook (executable by humans)

Status: `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`  
Tooling: `NATURALISTIC_TOOLING=READY`  
Human validation: `NOT_STARTED` / `BLOCKED_HUMAN` until real cases + reviewers exist

## Inventory (repo)

```text
PROTOCOL=docs/hfa-backlog/NATURALISTIC_VNEXT_VALIDATION_PROTOCOL.md
CASE_MANIFEST=docs/hfa-backlog/naturalistic-kit/schemas/case-manifest.schema.json (+ case-manifest.empty.json)
REFERENCE_FORM=docs/hfa-backlog/naturalistic-kit/schemas/human-reference.schema.json
BLINDED_REVIEW_FORM=docs/hfa-backlog/naturalistic-kit/schemas/blind-evaluator-form.schema.json
VNEXT_CAPTURE=docs/hfa-backlog/naturalistic-kit/schemas/vnext-output-capture.schema.json
ADJUDICATION_LOG=docs/hfa-backlog/naturalistic-kit/schemas/adjudication-log.schema.json
ANALYSIS_SCRIPT=tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts
TEST_FIXTURES=docs/hfa-backlog/naturalistic-kit/fixtures/TEST_*.json (scientificUse=false ONLY)
```

Note: `tests/sera-vnext/engine-validation-v03-naturalistic/*` is an **engine corpus**, not an authorized human-blind naturalistic cohort. Do not treat it as `REAL_CASES` for issue #15.


## V04 upgrade for all new campaigns

For any campaign created after the PR #50/V3 remediation, use `_TEMPLATE_V04` and the V2 schemas. V1 remains readable for historical campaigns only. V04 requires per-axis `code | unresolved | not_scored` and records development exposure before holdout eligibility is decided.

A case with Action=A-B and Objective=UNRESOLVED is **not** a global abstention. `not_scored` is reserved for an axis intentionally outside the designed question.

Known development-exposed cohorts are listed in `V04_DEVELOPMENT_EXPOSURE_LEDGER.json` and cannot be promoted to `sealed_holdout`.

## Mandatory flow

```text
CASE_SELECTION
↓
REFERENCE_LOCK
↓
BLINDING
↓
HUMAN_REVIEW
↓
VNEXT_EXECUTION
↓
UNBLIND
↓
ADJUDICATION
↓
DESCRIPTIVE_ANALYSIS
↓
AUTHOR/METHODOLOGICAL_DECISION
```

## Workspace layout (per campaign)

Store artifacts under (create when starting a real campaign — keep empty until then):

```text
docs/hfa-backlog/naturalistic-kit/campaigns/<campaignId>/
  manifest.json
  reference/          # sealed human reference — NEVER distribute to blind reviewers
  blind/              # blind forms only (no vNext, no reference labels)
  vnext/              # engine captures after (or parallel but sealed from reviewers)
  adjudication/       # after unblind
  pairs/              # NATURALISTIC_DESCRIPTIVE_PAIR_V1 for analysis (scientificUse:true only if authorized)
```

## Blinding / reference locks

1. Lock reference (`sealedFromBlindEvaluators: true`, `lockedAt` set) **before** distributing blind packets.
2. Blind packet must contain: case narrative (authorized extract) + blank form. Must **not** contain reference codes or vNext codes.
3. Reviewer confirms `blindConfirmed: true` and `confirmedNoVNextAccess: true`.
4. Capture vNext separately; never overwrite reference fields from engine output.
5. Unblind only after all assigned blind forms for the case are collected (or case excluded).
6. Adjudication is a separate log; it may revise campaign disposition, not silently rewrite sealed reference without an adjudication entry.

Enforcement helper:

```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/validate-naturalistic-campaign-layout.ts \
  --campaign docs/hfa-backlog/naturalistic-kit/campaigns/_TEMPLATE
```

## Required record fields

| Field | Where |
|-------|--------|
| caseId | all artifacts |
| provenance / sourceType / eligibility | manifest |
| reviewerId (pseudonymous) | blind form |
| P / O / A / UNRESOLVED | reference, blind, vNext |
| observations | comments/notes |
| engineVersion / taxonomyVersion | vNext capture (+ forms) |
| timestamp | lockedAt / evaluatedAt / capturedAt / adjudication.at |
| adjudication + reason | adjudication log |

No unnecessary PII: use pseudonymous reviewer IDs; store narrative by authorized reference pointer when possible.

## Analysis

```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts \
  --input <pairsDir>
```

Outputs descriptive metrics only. **Cannot** emit `VALIDATION_PASS` / `VALIDATION_FAIL` / `PRODUCTION_READY` / `SHADOW_APPROVED`.  
`TEST_*` fixtures and `scientificUse:false` never enter the scientific cohort; `scientificUse:true` on `TEST_*` is a hard error.

## What must be provided to unblock human validation

```text
REAL_CASES=NOT_AVAILABLE
REAL_REVIEWERS=NOT_AVAILABLE
HUMAN_VALIDATION=BLOCKED_HUMAN
```

Provide:

1. Author-approved case list (IDs + provenance + eligibility) for human-blind protocol.
2. Pseudonymous reviewer roster + ethics/authorization note.
3. Campaign id and sealed references.
4. Author decision on interpretive thresholds (not invented by tooling).
