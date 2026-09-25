import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { runStep04DirectActor as runLegacyDirectActor } from '../../steps/04-direct-actor'

function normalizeText(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function roleAssigned(text: string, actor: 'captain' | 'copilot', role: 'pf' | 'pm'): boolean {
  const actorPattern = actor === 'captain' ? /\b(comandante|captain)\b/g : /\b(copiloto|first officer)\b/g
  const allActorPattern = /\b(comandante|captain|copiloto|first officer)\b/g
  for (const match of text.matchAll(actorPattern)) {
    const start = match.index ?? 0
    allActorPattern.lastIndex = start + match[0].length
    const next = allActorPattern.exec(text)
    const end = Math.min(next?.index ?? text.length, start + 100)
    const segment = text.slice(start, end)
    if (new RegExp('\\b' + role + '\\b').test(segment)) return true
  }
  const label = actor === 'captain' ? '(?:comandante|captain)' : '(?:copiloto|first officer)'
  return new RegExp('\\b' + role + '\\b\\s*[:=\\-]\\s*' + label + '\\b').test(text)
}

function hasAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

export function runStep06DirectActor(input: {
  engineInput: SeraVNextEngineInput
  unsafeActOrCondition: SeraVNextEngineOutput['unsafeActOrCondition']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraVNextEngineOutput['directActor'] {
  const clarificationActorText = (input.engineInput.supplementalEvidence ?? [])
    .filter((item) => item.stage === 'DIRECT_ACTOR' || item.stage === 'ESCAPE_POINT')
    .map((item) => item.statement)
    .join(' ')
  const text = normalizeText(`${input.engineInput.narrative} ${clarificationActorText}`)
  const copilotPf = roleAssigned(text, 'copilot', 'pf')
  const captainPf = roleAssigned(text, 'captain', 'pf')
  const captainPm = roleAssigned(text, 'captain', 'pm')
  const copilotPm = roleAssigned(text, 'copilot', 'pm')
  const escapeText = normalizeText(input.escapePoint.earliestCandidate ?? input.escapePoint.statement ?? '')
  const escapeHasCopilot = /\b(copiloto|first officer)\b/.test(escapeText)
  const escapeHasCaptain = /\b(comandante|captain|training captain)\b/.test(escapeText)
  const escapeHasMaintenance =
    /\b(maintenance|mechanic|inspector|manutencao|mecanico|mecanicos|inspetor|inspetores)\b/.test(escapeText) ||
    /\b(inspecao (?:de )?pre[- ]?voo|pre[- ]?voo|preflight inspection)\b/.test(escapeText)
  const narrativeHasMaintenance = /\b(maintenance|mechanic|inspector|manutencao|mecanico|mecanicos|inspetor|inspetores)\b/.test(text)
  const crewOrPilotMention = hasAny(text, ['crew', 'pilot', 'captain', 'first officer', 'tripulacao', 'tripulação', 'comandante', 'copiloto', 'piloto'])
  const systemDominant =
    (input.unsafeActOrCondition.type === 'UNSAFE_CONDITION' && !crewOrPilotMention) ||
    hasAny(text, ['technical condition', 'system failure', 'automation failure', 'rudder movement', 'microburst', 'windshear'])

  const legacy = runLegacyDirectActor(
    {
      inputId: input.engineInput.inputId,
      narrative: input.engineInput.narrative,
      sourceType: 'neutral_trial',
      locale: input.engineInput.locale,
    },
    {
      unsafeAct: {
        statement: input.unsafeActOrCondition.type === 'UNSAFE_ACT' ? input.unsafeActOrCondition.statement : null,
        evidence: input.unsafeActOrCondition.type === 'UNSAFE_ACT' ? input.unsafeActOrCondition.evidence : [],
        confidence: 'low',
        uncertainty: [],
        humanReviewRequired: true,
      },
      unsafeCondition: {
        statement: input.unsafeActOrCondition.type === 'UNSAFE_CONDITION' ? input.unsafeActOrCondition.statement : null,
        evidence: input.unsafeActOrCondition.type === 'UNSAFE_CONDITION' ? input.unsafeActOrCondition.evidence : [],
        confidence: 'low',
        uncertainty: [],
        humanReviewRequired: true,
      },
      dominance:
        input.unsafeActOrCondition.type === 'UNSAFE_ACT'
          ? 'unsafe_act_dominant'
          : input.unsafeActOrCondition.type === 'UNSAFE_CONDITION'
            ? 'unsafe_condition_dominant'
            : 'mixed',
    }
  )

  if (input.escapePoint.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      actor: null,
      status: 'AMBIGUOUS',
      alternatives: [],
      actorMigrationWarnings: ['Direct actor remains unresolved until the escape point is established; post-escape detection or recovery actors must not be promoted by salience alone.'],
    }
  }

  if (!systemDominant) {
    // Actor attribution is anchored first to the sentence that defines the escape-point candidate.
    // Whole-report mentions are only fallback context, preventing migration to a different crew member.
    if (escapeHasMaintenance && narrativeHasMaintenance) {
      return {
        actor: 'maintenance team (collective)',
        status: 'IDENTIFIED',
        alternatives: ['maintenance inspector', 'maintenance technician'],
        actorMigrationWarnings: [],
      }
    }
    if (escapeHasMaintenance && !narrativeHasMaintenance) {
      return {
        actor: null,
        status: 'AMBIGUOUS',
        alternatives: ['maintenance team', 'maintenance inspector', 'maintenance technician'],
        actorMigrationWarnings: ['The escape point is anchored to preflight/maintenance activity, but the responsible maintenance actor is not identified; do not migrate attribution to post-escape flight-crew detection or recovery.'],
      }
    }
    if (escapeHasCopilot && !escapeHasCaptain) {
      const actor = copilotPf ? 'copiloto (PF)' : copilotPm ? 'copiloto (PM)' : 'copiloto'
      return { actor, status: 'IDENTIFIED', alternatives: ['tripulação'], actorMigrationWarnings: [] }
    }
    if (escapeHasCaptain && !escapeHasCopilot) {
      const actor = captainPf ? 'comandante (PF)' : captainPm ? 'comandante (PM)' : 'comandante'
      return { actor, status: 'IDENTIFIED', alternatives: ['tripulação'], actorMigrationWarnings: [] }
    }
    if (/\b(copiloto|first officer)\b.{0,120}\b(inseriu|programou|selecionou|ajustou|executou|iniciou|continuou|decidiu|inserted|programmed|selected|set|executed|initiated|continued|decided)\b/.test(text)) {
      const actor = copilotPf ? 'copiloto (PF)' : copilotPm ? 'copiloto (PM)' : 'copiloto'
      return { actor, status: 'IDENTIFIED', alternatives: ['tripulação'], actorMigrationWarnings: [] }
    }
    if (/\b(comandante|captain)\b.{0,120}\b(n[aã]o iniciou|n[aã]o executou|continuou|decidiu|selecionou|executou|iniciou|did not initiate|failed to initiate|continued|decided|selected|executed|initiated)\b/.test(text)) {
      const actor = captainPf ? 'comandante (PF)' : captainPm ? 'comandante (PM)' : 'comandante'
      return { actor, status: 'IDENTIFIED', alternatives: ['tripulação'], actorMigrationWarnings: [] }
    }
    if (copilotPf) {
      return {
        actor: 'copiloto (PF)',
        status: 'IDENTIFIED',
        alternatives: captainPm ? ['comandante (PM) — monitor/barreira', 'tripulação'] : ['tripulação'],
        actorMigrationWarnings: captainPm ? ['PM identificado como ator contributivo de monitoramento/barreira; manter P/O/A principal ancorado no PF.'] : [],
      }
    }
    if (captainPf) {
      return {
        actor: 'comandante (PF)',
        status: 'IDENTIFIED',
        alternatives: copilotPm ? ['copiloto (PM) — monitor/barreira', 'tripulação'] : ['tripulação'],
        actorMigrationWarnings: copilotPm ? ['PM identificado como ator contributivo de monitoramento/barreira; manter P/O/A principal ancorado no PF.'] : [],
      }
    }
    if (hasAny(text, ['captain decided', 'captain continued', 'captain selected', 'captain turned'])) {
      return {
        actor: 'captain',
        status: 'IDENTIFIED',
        alternatives: ['flight crew (collective)'],
        actorMigrationWarnings: [],
      }
    }
    if (hasAny(text, ['first officer decided', 'first officer continued', 'first officer selected'])) {
      return {
        actor: 'first officer',
        status: 'IDENTIFIED',
        alternatives: ['flight crew (collective)'],
        actorMigrationWarnings: [],
      }
    }
    if (
      hasAny(text, [
        'crew',
        'the crew',
        'flight crew',
        'two pilots',
        'crew continued',
        'crew lined up',
        'crew descended',
        'crew did not perceive',
        'tripulacao',
        'dois pilotos',
        'ambos os pilotos',
      ])
    ) {
      return {
        actor: 'flight crew (collective)',
        status: 'IDENTIFIED',
        alternatives: ['captain', 'first officer', 'crew collective'],
        actorMigrationWarnings: [],
      }
    }
    if (hasAny(text, ['the pilot', 'pilot decided', 'pilot moved', 'pilot continued'])) {
      return {
        actor: 'pilot',
        status: 'IDENTIFIED',
        alternatives: ['flight crew (collective)'],
        actorMigrationWarnings: [],
      }
    }
    if (hasAny(text, ['maintenance technician', 'maintenance team', 'mechanic', 'mecanico', 'mecanicos', 'manutencao'])) {
      return {
        actor: 'maintenance team (collective)',
        status: 'IDENTIFIED',
        alternatives: ['maintenance inspector', 'maintenance technician'],
        actorMigrationWarnings: [],
      }
    }
    if (hasAny(text, ['controller', 'atc', 'air traffic control'])) {
      return {
        actor: 'atc',
        status: 'IDENTIFIED',
        alternatives: [],
        actorMigrationWarnings: [],
      }
    }
  }

  if (legacy.actorKind === 'system_or_condition_dominant') {
    return {
      actor: null,
      status: 'NOT_APPLICABLE',
      alternatives: [],
      actorMigrationWarnings: [],
    }
  }

  return {
    actor: legacy.actor,
    status: legacy.actor ? 'IDENTIFIED' : 'AMBIGUOUS',
    alternatives: legacy.actorKind === 'crew_collective' ? ['captain', 'first officer', 'crew collective'] : [],
    actorMigrationWarnings:
      legacy.actorKind === 'unknown' ? ['Direct actor remains unresolved; avoid actor migration beyond available evidence.'] : [],
  }
}
