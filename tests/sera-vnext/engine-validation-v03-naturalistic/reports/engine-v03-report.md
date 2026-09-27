# SERA vNext Engine Validation V03 — Naturalistic Corpus

Generated at: 2026-09-27T01:21:23.249Z
Final decision: SERA_VNEXT_ENGINE_V03_NATURALISTIC_PASS
Manifest hash: 17603fda2fdf8d94857524626a574fe83837302d5059eb2d4561f1a58276a681
Expected outputs hash: 435851ab073f84daf85815d74516e6789ff56c8bb3dc9b5c65d45abba113ec7b

## Corpus
- Total cases: 36
- Calibration: 12
- Validation: 12
- Holdout: 12 (untouched)

## Gate Results

| Gate | Target | Actual | Status |
|---|---|---|---|
| Incorrect critical code = 0 | 0 | 0 | ✓ |
| Correct abstention ≥ 90% | ≥ 90% | 100.0% | ✓ |
| Violation-awareness boundary = 100% | 100% | 100.0% | ✓ |
| Post-escape boundary = 100% | 100% | 100.0% | ✓ |
| Consequence quarantine = 100% | 100% | 100.0% | ✓ |
| No O-E = 100% | 100% | 100.0% | ✓ |
| PT code recall ≥ 70% | ≥ 70% | 100.0% | ✓ |
| EN code recall ≥ 70% | ≥ 70% | 100.0% | ✓ |
| Language gap ≤ 15pp | ≤ 15pp | 0.0pp | ✓ |
| Determinism = 1.0 | 1.0 | 1 | ✓ |

## Detailed Metrics

| Metric | Value |
|---|---|
| Code expected cases | 8 |
| Correct code | 8 |
| Incorrect code | 0 |
| Code precision | 100.0% |
| Code recall | 100.0% |
| Abstention expected cases | 16 |
| Correct abstention | 16 |
| Incorrect abstention | 0 |
| Abstention precision | 100.0% |
| Abstention recall | 100.0% |
| PT code recall | 100.0% |
| EN code recall | 100.0% |
| Language recall gap | 0.0pp |
| Guardrail TP rate | 0.0% |
| Guardrail FP rate | 0.0% |
| Final outputs blocked | 100.0% |

## Limitations

None.

## Case Results

| Case | Locale | Group | Expected | Outcome | Passed |
|---|---|---|---|---|---|
| V03-CAL-01 | en | calibration | {"kind":"code","axis":"perception","code":"P-B"} | CORRECT_CODE | ✓ |
| V03-CAL-02 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-03 | en | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-04 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-05 | en | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-06 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-07 | en | calibration | {"kind":"code","axis":"action","code":"A-F"} | CORRECT_CODE | ✓ |
| V03-CAL-08 | pt-BR | calibration | {"kind":"code","axis":"action","code":"A-F"} | CORRECT_CODE | ✓ |
| V03-CAL-09 | en | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-10 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-CAL-11 | en | calibration | {"kind":"code","axis":"objective","code":"O-C"} | CORRECT_CODE | ✓ |
| V03-CAL-12 | pt-BR | calibration | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-01 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-02 | pt-BR | validation | {"kind":"code","axis":"perception","code":"P-B"} | CORRECT_CODE | ✓ |
| V03-VAL-03 | en | validation | {"kind":"code","axis":"perception","code":"P-H"} | CORRECT_CODE | ✓ |
| V03-VAL-04 | pt-BR | validation | {"kind":"code","axis":"perception","code":"P-G"} | CORRECT_CODE | ✓ |
| V03-VAL-05 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-06 | pt-BR | validation | {"kind":"code","axis":"perception","code":"P-H"} | CORRECT_CODE | ✓ |
| V03-VAL-07 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-08 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-09 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-10 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-11 | en | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
| V03-VAL-12 | pt-BR | validation | {"kind":"abstention"} | CORRECT_ABSTENTION | ✓ |
