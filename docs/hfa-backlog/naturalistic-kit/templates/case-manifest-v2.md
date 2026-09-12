# Naturalistic case manifest V2

Required per case:
- `caseId`
- `sourceType`
- `caseRole`: calibration / internal_validation / sealed_holdout
- `developmentExposure`: true/false
- `holdoutEligible`: true/false
- `eligibility`: eligible / excluded / pending_review
- `provenance`
- `sourceHash` and `narrativeHash` before sealed holdout execution

A `sealed_holdout` case must be unexposed, explicitly eligible, and locked before engine execution.
