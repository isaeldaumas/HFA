# SERA-PT Author Decision — Preconditions, Risk and HFACS v1.0

Status: ACCEPTED_AUTHOR_CLARIFICATION
Date: 2026-09-26

## Preconditions

SERA active failures describe what happened; preconditions describe why that active failure became more likely and therefore identify intervention points.

The canonical precondition taxonomy follows Hendy (2003) and the Daumas dissertation:
- 12 immediate preconditions: seven Personnel factors, two Task factors and three Working Conditions factors;
- 3 Command, Control and Supervision factors;
- 6 Organizational factors.

Hendy Table 1 and Annex B provide the set of **most likely preconditions** associated with each active failure. This association is an investigative guide, not an automatic causal assignment. A precondition is reported only when event evidence supports it. Evidence outside the most-likely set may be retained, but must be identified as such and reviewed conservatively.

No-failure terminal codes do not generate failure-specific preconditions.

## Risk management

Two separate uses of SERA data must not be conflated.

1. **Observed organizational risk signature** — descriptive aggregation of reviewed event results: active-failure frequencies, canonical precondition frequencies, and failure/precondition combinations. These frequencies do not represent accident probability without exposure denominators.

2. **Prospective Hendy risk prototype** — tactical and strategic pre-mission assessment using the SERA precondition states. Hendy's 0/5/10 mathematical examples are explicitly notional and require validation before operational use. They must be labelled `NOT_VALIDATED_PROTOTYPE` and must not silently replace an organization's approved operational risk process.

Qualification and Authorization remains a GO/NO-GO criterion in the tactical prototype rather than a scored degradation factor.

## HFACS bridge

SERA remains the investigative decision process. HFACS is a downstream correspondence layer only.

Best-fit mappings follow Hendy Tables 3–6. They are not one-to-one; some SERA categories map to multiple AGA 135 HFACS categories and contextual interpretation remains necessary. HFACS must never select, override, or reconstruct a SERA P/O/A code.

## Presentation

The canonical SERA tree topology and branch logic are preserved. Visual presentation may improve spacing, numbering, highlighting and text wrapping, but may not add, remove or reorder decision nodes.

Each traversed node should show the canonical question and the selected answer in the flow itself. Any explanatory card uses the same step number as its corresponding node.
