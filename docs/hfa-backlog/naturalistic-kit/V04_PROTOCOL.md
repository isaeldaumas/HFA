# SERA vNext — V04 blind validation protocol

**Status:** `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`
**Tooling target:** per-axis blind validation without global-abstention ambiguity.

## Why V04 exists

V03 used a case-level `code | abstention` expectation. That can erase valid information on one axis when another axis is unresolved. V04 scores Perception, Objective, and Action independently using `code`, `unresolved`, or `not_scored`.

## Cohorts

- `calibration`: may be development-exposed; never scientific evidence.
- `internal_validation`: real cases allowed for internal evaluation, but not necessarily independent.
- `sealed_holdout`: must have `developmentExposure=false`, `holdoutEligible=true`, source/narrative hashes locked before engine execution, and blind human review.

Known ineligible cohorts are recorded in `V04_DEVELOPMENT_EXPOSURE_LEDGER.json`. V03 and the A4R78/A4R193 historical real-event corpus are not sealed holdout.

## Per-axis contract

Each axis has: `score`, `status`, `code`, confidence/evidence, and rejected alternatives. `unresolved` is a scored outcome. `not_scored` means the axis is outside the designed question and is excluded from that metric.

## Mandatory order

CASE_SELECTION → SOURCE_HASH_LOCK → BLIND_HUMAN_A → BLIND_HUMAN_B → REFERENCE_LOCK/ADJUDICATION → VNEXT_EXECUTION → UNBLIND → DESCRIPTIVE_ANALYSIS → AUTHOR_DECISION.

## Non-negotiable safeguards

- No engine output visible to blind reviewers.
- No case used to tune runtime may enter sealed holdout.
- No P-A/O-A/A-A from silence; positive evidence required.
- O-C remains strict: known applicable rule + awareness + conscious deviation + non-routine character.
- O-E is forbidden.
- `selectedCode`, `releasedCode`, `finalConclusion` remain null; downstream/release flags remain false.
- Tooling never emits scientific PASS or production authorization.

## Metrics

Report per axis: comparable N, exact agreement, unresolved agreement, confusion matrix, Cohen kappa when applicable, O-C false positives, O-E count, determinism and lock failures. Full-triplet agreement is secondary and never replaces per-axis metrics.

## Current blocker

`REAL_INDEPENDENT_HOLDOUT=NOT_AVAILABLE` and `BLIND_HUMAN_REVIEWERS=NOT_AVAILABLE`. This is a genuine human/evidence blocker, not a software blocker.
