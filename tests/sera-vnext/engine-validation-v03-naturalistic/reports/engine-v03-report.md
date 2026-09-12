# SERA vNext Engine Validation V03 — Naturalistic Corpus

Generated at: 2026-06-09T13:42:07.839Z
Final decision: ENGINE_NATURALISTIC_VALIDATION_NOT_READY
Manifest hash: 9dd566074e45ce95a681cf0d7da9e26cf935354350597174023e50c0b4f1d6ed
Expected outputs hash: 858d17a75c2b3f7235a0d89fdc1d8404fd64c10a9c9df54dc7febdb4f19f97de

## Corpus
- Total cases: 36
- Calibration: 12
- Validation: 12
- Holdout: 12 (untouched)

## Gate Results

| Gate | Target | Actual | Status |
|---|---|---|---|
| Incorrect critical code = 0 | 0 | 1 | ✗ |
| Correct abstention ≥ 90% | ≥ 90% | 100.0% | ✓ |
| Violation-awareness boundary = 100% | 100% | 100.0% | ✓ |
| Post-escape boundary = 100% | 100% | 50.0% | ✗ |
| Consequence quarantine = 100% | 100% | 100.0% | ✓ |
| No O-E = 100% | 100% | 100.0% | ✓ |
| PT code recall ≥ 70% | ≥ 70% | 0.0% | ✗ |
| EN code recall ≥ 70% | ≥ 70% | 0.0% | ✗ |
| Language gap ≤ 15pp | ≤ 15pp | 0.0pp | ✓ |
| Determinism = 1.0 | 1.0 | 1 | ✓ |

## Detailed Metrics

| Metric | Value |
|---|---|
| Code expected cases | 14 |
| Correct code | 0 |
| Incorrect code | 1 |
| Code precision | 0.0% |
| Code recall | 0.0% |
| Abstention expected cases | 10 |
| Correct abstention | 10 |
| Incorrect abstention | 13 |
| Abstention precision | 43.5% |
| Abstention recall | 100.0% |
| PT code recall | 0.0% |
| EN code recall | 0.0% |
| Language recall gap | 0.0pp |
| Guardrail TP rate | 0.0% |
| Guardrail FP rate | 0.0% |
| Final outputs blocked | 100.0% |

## Limitations

- INCORRECT_CRITICAL_CODE: 1 incorrect codes on critical boundaries
- PT_CODE_RECALL_BELOW_70: 0.0%
- EN_CODE_RECALL_BELOW_70: 0.0%

## Case Results

| Case | Locale | Group | Expected | Outcome | Passed |
|---|---|---|---|---|---|
| V03-CAL-01 | en | calibration | {"kind":"code","axis":"perception","code":"P-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-02 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-03 | en | calibration | {"kind":"code","axis":"action","code":"A-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-04 | pt-BR | calibration | {"kind":"code","axis":"perception","code":"P-C"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-05 | en | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-06 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-07 | en | calibration | {"kind":"code","axis":"action","code":"A-F"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-08 | pt-BR | calibration | {"kind":"code","axis":"action","code":"A-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-09 | en | calibration | {"kind":"code","axis":"action","code":"A-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-10 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-11 | en | calibration | {"kind":"code","axis":"objective","code":"O-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-CAL-12 | pt-BR | calibration | {"kind":"code","axis":"objective","code":"O-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-01 | en | validation | {"kind":"code","axis":"action","code":"A-B"} | INCORRECT_CODE | ✗ |
| V03-VAL-02 | pt-BR | validation | {"kind":"code","axis":"perception","code":"P-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-03 | en | validation | {"kind":"code","axis":"action","code":"A-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-04 | pt-BR | validation | {"kind":"code","axis":"perception","code":"P-B"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-05 | en | validation | {"kind":"code","axis":"action","code":"A-F"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-06 | pt-BR | validation | {"kind":"code","axis":"action","code":"A-F"} | INCORRECT_ABSTENTION | ✗ |
| V03-VAL-07 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-08 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-09 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-10 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-11 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-12 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
