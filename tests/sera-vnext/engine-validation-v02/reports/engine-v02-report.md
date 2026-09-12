# SERA vNext Engine Validation v02

Generated at: 2026-09-12T17:08:24.778Z
Final decision: SERA_VNEXT_ENGINE_V02_PASS_WITH_LIMITATIONS
Manifest hash: b1010553970909d2a283a60f4053dfc16c09cbe6b58488e6d3019dca7ee4a4ae

## Metrics
- classification_accuracy: 1
- abstention_precision: 0.2143
- abstention_recall: 1
- guardrail_detection_rate: 1
- leaf_coverage: 1
- language_parity: {"pt-BR":1,"en":1}
- determinism: 1
- critical_boundary_pass_rate: 1
- product_parity: 1

## Limitations
- v02 validation is deterministic technical validation, not scientific or human inter-rater validation.
- existing 39-case regression is retained as boundary/final-output guardrail coverage, not accuracy proof.

## Failures
- none
