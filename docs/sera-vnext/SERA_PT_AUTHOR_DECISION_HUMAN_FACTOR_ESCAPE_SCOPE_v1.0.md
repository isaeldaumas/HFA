# SERA-PT Author Decision — Human-Factor Escape Scope v1.0

Status: ACCEPTED_AUTHOR_CLARIFICATION
Date: 2026-09-26
Scope: safe-operation escape point / human-factors causal boundary

## 1. Core decision

The HFA/SERA analysis is a **human-factors investigation**, not a general causal reconstruction of the whole accident.

The complete event may be reconstructed to understand chronology, system state, weather, maintenance, dispatch, organizational context and alternative unsafe acts. That global view is an evidence-organizing layer only.

A SERA P/O/A traversal may start only after a **human-factor escape anchor** has been established: an observable unsafe act/inaction, or an unsafe condition whose controlled variable was under an operator or crew's operational control.

Purely technical failures, weather states, documentary statements or organizational conditions cannot, by themselves, become the safe-operation escape point for P/O/A.

## 2. Source grounding

Hendy defines departure from safe operation as the point marked by an observable unsafe act or unsafe condition on the accident trajectory. An unsafe act is observable and is the outcome of a decision. Analysis starts with operators or crews directly involved in the unsafe act/condition and controlling the variable that left acceptable limits.
Daumas operationalizes the same sequence: reconstruct the timeline, define the safe-operation escape point and unsafe act/condition, then begin with the operator directly involved and evaluate Objective, Perception and Action.

## 3. Global view versus canonical decision

The runtime architecture is therefore:

`GLOBAL EVENT CONTEXT → HUMAN-FACTOR ESCAPE ANCHOR → DIRECT OPERATOR → CANONICAL P/O/A TREE → PRECONDITIONS`

The global context layer may identify several technical states, upstream human contributions and possible unsafe acts, but it has no authority to release P/O/A codes.

If a code appears without a matching canonical node-by-node path, the analysis is invalid and must fail closed.

## 4. Multiple unsafe acts

Hendy states that SERA v1.0 analyses one unsafe act at a time. A single accident may contain multiple unsafe acts, but each additional act requires its own SERA traversal.

No operator group or operational phase has automatic priority. A maintenance, dispatch, ground or flight-crew act may be the SERA anchor when it is the supported human-factor departure from safe operation. If several human unsafe acts/conditions are plausible, the current traversal must analyse only one; the escape-boundary choice remains explicit and reviewable, and additional acts require separate SERA traversals.

## 5. Interpretation rule

The safe-operation escape point is not the earliest technical abnormality and not automatically the earliest organizational deficiency. It is the relevant human-factor boundary on the accident trajectory from which the unsafe operation is anchored for SERA analysis.

When evidence is insufficient to establish that boundary, actor or P/O/A path, the result remains `UNRESOLVED` / `INSUFFICIENT_EVIDENCE` and is escalated to human review.

## 6. Author clarification — Hendy dual-landmark rule (2026-09-27)

The term “escape point” must not collapse three different notions: the earliest fact mentioned in a report, the **first departure from safe operation**, and the **most critical unsafe act or unsafe condition**.

Hendy explicitly distinguishes the first departure from safe operation from the most critical unsafe act/condition. The first departure is the earliest observable crossing from safe to unsafe operation on the occurrence trajectory. The critical unsafe act/condition is the supported point from which the trajectory leads directly to the accident or incident and, in Hendy's formulation, only one trajectory remains.

Every candidate must therefore satisfy the occurrence-trajectory test: the investigator must be able to trace the path from that unsafe act/condition to the final outcome, and its removal or modification would have prevented the accident or incident. Mere temporal precedence is insufficient.

Facts from maintenance, dispatch, equipment, weather, supervision or organization that only **set the scene** are context or preconditions. They do not become the primary P/O/A anchor merely because they happened earlier. They may be a SERA unsafe act in a separate traversal only when the evidence establishes that act itself on the relevant occurrence trajectory.

### HFA/SERA operationalization authorized for the engine

When the two Hendy landmarks coincide, the engine records one discrete anchor (`FIRST_DEPARTURE_AND_CRITICAL_ACT`).

When they differ, the engine must preserve both:

- `firstDepartureCandidate`: first supported departure from safe operation;
- `criticalUnsafeActCandidate`: most directly outcome-linked supported unsafe act/condition before the final consequence boundary;
- primary P/O/A anchor: `criticalUnsafeActCandidate`;
- the interval from first departure to critical act remains a legitimate causal-analysis window and must not be discarded as post-escape consequence merely because it occurs after the first departure.

When the evidence does not support the relationship between the two landmarks, the engine must fail closed or retain the boundary as candidate/review-required. It must never choose an upstream maintenance/dispatch/organizational fact solely by document order, phase order or narrative salience.
