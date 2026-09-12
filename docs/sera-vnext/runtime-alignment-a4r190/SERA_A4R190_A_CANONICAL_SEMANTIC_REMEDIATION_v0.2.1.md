# SERA A4R190-A — Canonical Semantic Remediation v0.2.1

**Document Status**: ACTIVE
**Authority Tier**: 1
**Can be used for P/O/A classification?**: NO
**Can override canonical method lock?**: NO
**Downstream allowed?**: NO

## Purpose

Record the executable alignment required by the current SERA-PT taxonomy and author decisions. The historical A4R99 asset remains preserved as source evidence; this record does not rewrite its questions. It reconciles branch-to-leaf meaning where that historical asset conflicts with the later canonical taxonomy and the user-authorized methodology correction.

## Canonical corrections

| surface | old | new | canonical rationale |
|---|---|---|---|
| `O_MANAGED_RISK / SIM` | `O-A` | `O-D` | The exact PT question is negative: an unmanaged/non-conservative goal answers `SIM`; `O-D` is the active non-violation objective failure. |
| `O_MANAGED_RISK / NÃO` | `O-D` | `O-A` | Managed/conservative risk answers `NÃO`; `O-A` is the no-specific-objective-failure leaf. |
| `A_IMPLEMENTED / NÃO_DESLIZE_LAPSO_ERRO` | `A-C` | `A-B` | `A-B` is procedural/physical omission, lapse, or slip. |
| `A_IMPLEMENTED / NÃO_FEEDBACK` | `A-B` | `A-C` | `A-C` is feedback or verification after the actor's own action. |
| legacy protective-intent shortcut | `O-C` | no automatic code | Protective motive, urgency, emergency, or dangerous outcome is context, not proof of a conscious exceptional violation. |
| incomplete formal-violation evidence | `O-D` possible through efficiency text | no automatic code | A formal violation blocks the O-D non-violation branch even when the full O-C triad is not yet evidenced. |
| candidate fixture `A0-AUTO-004-ADJ` | `A-G` | `A-C` | FMA verification is feedback on the crew's own action. |
| candidate fixture `A0-CHK-003` | `A-G` | `A-C` | Post-checklist cross-check is feedback on the crew's own action. |
| v02 A-B/A-C reachability and independent oracles | feedback→`A-B`; slip/lapse→`A-C` | slip/lapse→`A-B`; own-action feedback→`A-C` | The historical expected values were inverted against the later canonical taxonomy. |
| v02 A-F/A-I reachability and independent oracles | selection under time→`A-F`; selection without time→`A-I` | selection without time→`A-F`; selection under dominant time→`A-I` | Time pressure distinguishes the two selection leaves. |
| v02 A-G/A-J reachability and independent oracles | feedback under time→`A-G`; third-party feedback without time→`A-J` | third-party feedback without time→`A-G`; feedback under dominant time→`A-J` | Dominant time pressure distinguishes the feedback/communication leaves. |

## Runtime rules locked

- `O-C` requires applicable known rule/procedure, awareness, conscious deviation, and explicit non-routine character.
- `O-D` is available only for explicit less-conservative efficiency/economy/operational-gain objective without a dominant formal violation.
- `A-G` is third-party supervision, verification, or coordination without dominant time pressure.
- `A-J` is feedback/communication/readback closure failure under dominant time pressure.
- `P-A`, `O-A`, and `A-A` remain no-specific-failure leaves.
- `O-E` remains `NON_EXISTENT_IN_SERA_PT_V1` and is never a leaf or output.

## Controls preserved

- Evidence is evaluated only at the escape point; consequence remains quarantined.
- Candidate-only traversal, mandatory human review, `selectedCode`, `releasedCode`, `finalConclusion`, HFACS, Risk/ERC, and all downstream locks remain unchanged.
- This remediation does not enable production flags or claim naturalistic or scientific validation.
