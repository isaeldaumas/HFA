# SERA vNext Engine Validation v02

Generated at: 2026-06-09T13:42:06.770Z
Final decision: SERA_VNEXT_ENGINE_V02_PASS_WITH_LIMITATIONS
Manifest hash: cd66cae2a9c63a78f18ddf425830cc9ae703a5c7ca48ee741575b32879b1a207

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
