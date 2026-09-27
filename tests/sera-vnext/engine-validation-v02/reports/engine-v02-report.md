# SERA vNext Engine Validation v02

Generated at: 2026-09-27T01:21:20.793Z
Final decision: SERA_VNEXT_ENGINE_V02_NOT_READY
Manifest hash: b1010553970909d2a283a60f4053dfc16c09cbe6b58488e6d3019dca7ee4a4ae

## Metrics
- classification_accuracy: 0.25
- abstention_precision: 0.1091
- abstention_recall: 1
- guardrail_detection_rate: 1
- leaf_coverage: 0.2727
- language_parity: {"pt-BR":0.6923,"en":0.5}
- determinism: 1
- critical_boundary_pass_rate: 0.5
- product_parity: 1

## Limitations
- v02 validation is deterministic technical validation, not scientific or human inter-rater validation.
- existing 39-case regression is retained as boundary/final-output guardrail coverage, not accuracy proof.

## Failures
- V02-INDEP-PT-HELI-OA: expected objective=O-A, actual=null
- V02-INDEP-PT-TECH-PH: expected perception=P-H, actual=null
- V02-INDEP-PT-VIOL-AWARE: expected objective=O-B, actual=null
- V02-INDEP-PT-AA: expected action=A-A, actual=null
- V02-INDEP-EN-HELI-PF: expected perception=P-F, actual=null
- V02-INDEP-EN-TECH-PG: expected perception=P-G, actual=null
- V02-INDEP-EN-TECH-AB: expected action=A-C, actual=null
- V02-INDEP-EN-OD: expected objective=O-D, actual=null
- V02-INDEP-EN-AF: expected action=A-I, actual=null
- V02-INDEP-EN-OA: expected objective=O-A, actual=null
- V02-INDEP-EN-HELI-AG: expected action=A-J, actual=null
- V02-LEAF-P-A-EN: expected perception=P-A, actual=null
- V02-LEAF-P-B-EN: expected perception=P-B, actual=null
- V02-LEAF-P-E-EN: expected perception=P-E, actual=null
- V02-LEAF-P-F-EN: expected perception=P-F, actual=null
- V02-LEAF-P-G-EN: expected perception=P-G, actual=null
- V02-LEAF-P-H-EN: expected perception=P-H, actual=null
- V02-LEAF-O-A-PT: expected objective=O-A, actual=null
- V02-LEAF-O-B-PT: expected objective=O-B, actual=null
- V02-LEAF-O-C-EN: expected objective=O-C, actual=null
- V02-LEAF-O-D-EN: expected objective=O-D, actual=null
- V02-LEAF-A-A-PT: expected action=A-A, actual=null
- V02-LEAF-A-B-EN: expected action=A-B, actual=null
- V02-LEAF-A-C-PT: expected action=A-C, actual=null
- V02-LEAF-A-F-EN: expected action=A-F, actual=null
- V02-LEAF-A-H-EN: expected action=A-H, actual=null
- V02-LEAF-A-J-EN: expected action=A-G, actual=null
