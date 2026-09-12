# SERA vNext Engine Validation V0

Generated at: 2026-06-09T02:54:12.990Z

Final decision: SERA_VNEXT_ENGINE_V0_VALIDATION_BLOCKED
Product Beta gate: PRODUCT_BETA_FOUNDATION_BLOCKED

Cases: 9
Pass: 4
Partial: 5
Fail: 0
Error: 0

## Blocking reasons
- partial validations=5

## Determinism
- OFFICIAL-COMAIR-5191: runs=5 structural=1 semantic=1
- OFFICIAL-ASIANA-214: runs=5 structural=1 semantic=1
- OFFICIAL-UPS-1354: runs=5 structural=1 semantic=1
- OFFICIAL-GAP-004: runs=3 structural=1 semantic=1
- OFFICIAL-DELTA-191: runs=3 structural=1 semantic=1
- OFFICIAL-USAIR-427: runs=3 structural=1 semantic=1
- OFFICIAL-5N-BQJ: runs=3 structural=1 semantic=1
- ADV-CONSEQUENCE-AS-CAUSE: runs=3 structural=1 semantic=1
- ADV-POST-ESCAPE-P: runs=3 structural=1 semantic=1
- ADV-POST-ESCAPE-O: runs=3 structural=1 semantic=1
- ADV-POST-ESCAPE-A: runs=3 structural=1 semantic=1
- ADV-ACTOR-MIGRATION: runs=3 structural=1 semantic=1
- ADV-PRECONDITION-AS-ESCAPE: runs=3 structural=1 semantic=1
- ADV-OE: runs=3 structural=1 semantic=1
- ADV-VIOLATION-WITHOUT-AWARENESS: runs=3 structural=1 semantic=1
- ADV-INVENTED-INTENTION: runs=3 structural=1 semantic=1
- ADV-TECHNICAL-DOMINANT: runs=3 structural=1 semantic=1
- GEN-G-WNSB: runs=3 structural=1 semantic=1
- GEN-EXECUFLIGHT-1526: runs=3 structural=1 semantic=1
- GEN-THEBAUD: runs=3 structural=1 semantic=1
- GEN-PEL-AIR: runs=3 structural=1 semantic=1
- GEN-FIRST-AIR-6560: runs=3 structural=1 semantic=1

## Product Alpha parity
- passed=true

## Case results
- OFFICIAL-COMAIR-5191 [official] passed=false findings=partial:O code outside authored allowed set: null | partial:A code outside authored allowed set: null
- OFFICIAL-ASIANA-214 [official] passed=false findings=partial:P code outside authored allowed set: null | partial:O code outside authored allowed set: null | partial:A code outside authored allowed set: null
- OFFICIAL-UPS-1354 [official] passed=false findings=partial:O code outside authored allowed set: null
- OFFICIAL-GAP-004 [official] passed=true findings=pass:output matches authored boundary checks
- OFFICIAL-DELTA-191 [official] passed=true findings=pass:output matches authored boundary checks
- OFFICIAL-USAIR-427 [official] passed=true findings=pass:output matches authored boundary checks
- OFFICIAL-5N-BQJ [official] passed=true findings=pass:output matches authored boundary checks
- HUMAN-THEBAUD [human] passed=false findings=partial:escape point boundary not matched: visual approach | partial:P code outside authored allowed set: null
- HUMAN-CRANK-2026-0001 [human] passed=false findings=partial:O code outside authored allowed set: null
