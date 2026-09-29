import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { runStep04DirectActor as runLegacyDirectActor } from '../../steps/04-direct-actor'
import { isDirectControlResponseStatement, isExplicitOperationalDeviationStatement, isExplicitOperationalOmissionStatement } from '../factual-extraction-helpers'

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
  const primaryEscape = input.escapePoint.poaAnchorCandidate
    ?? input.escapePoint.criticalUnsafeActCandidate
    ?? input.escapePoint.firstDepartureCandidate
    ?? input.escapePoint.statement
    ?? input.escapePoint.earliestCandidate
    ?? input.escapePoint.latestCandidate
    ?? ''
  const escapeText = normalizeText(primaryEscape)
  const escapeHasCopilot = /\b(copiloto|first officer|sic)\b/.test(escapeText)
  const escapeHasCaptain = /\b(comandante|captain|training captain|pic)\b/.test(escapeText)
  const escapeHasCollectiveCrew = /\b(tripulacao|tripulação|flight crew|crew|ambos os pilotos|dois pilotos|nenhum piloto|nenhum dos pilotos|both pilots|neither pilot|nos|we)\b|\ba gente\b/.test(escapeText)
  const escapeHasOtherPilot = /\b(outro piloto|outro tripulante|o cara)\b.{0,220}\b(desacoplou|cancelou|reduziu|colocou|aplicou|puxou|empurrou|meteu|mexeu|pilotou|tentou|executou|subiu|desceu|fez|did|disengaged|cancelled|reduced|put|applied|pulled|pushed|executed)\b/.test(escapeText)
  const escapeHasNarratorAct = /\beu\b.{0,220}\b(decidi|resolvi|optei|escolhi|julguei|preferi|tirei|retirei|desguarneci|peguei|puxei|empurrei|assumi|pousei|fiz|conduzi|executei|tentei|i decided|i chose|i removed|i pulled|i landed)\b/.test(escapeText)
    || /\b(decidi|resolvi|optei|escolhi|julguei|preferi|tirei|retirei|desguarneci|peguei|puxei|empurrei|assumi|pousei|fiz|conduzi|executei|tentei)\b.{0,220}\b(eu|meu|minha)\b/.test(escapeText)
  const escapeHasJointDecision = /(?:\ba gente\b|\bnos\b|\bwe\b).{0,120}\b(resolveu|resolvemos|decidiu|decidimos|decided|resolved|chose|opted)\b.{0,160}\b(continuar|prosseguir|tentar|continue|proceed|try)\b/.test(escapeText)
  const escapeHasMaintenance =
    /\bmaintenance (?:team|technician|inspector|mechanic)s?\b|\bmechanics?\b|\binspectors?\b|\bequipe de manutencao\b|\btecnic[oa]s? de manutencao\b|\bmecanicos?\b|\binspetores?\b/.test(escapeText) ||
    /\b(inspecao (?:de )?pre[- ]?voo|pre[- ]?voo|preflight inspection)\b/.test(escapeText)
  const narrativeHasMaintenance = /\b(maintenance|mechanic|inspector|manutencao|mecanico|mecanicos|inspetor|inspetores)\b/.test(text)
  const anchorContext = normalizeText(`${input.unsafeActOrCondition.statement ?? ''} ${primaryEscape} ${input.escapePoint.supportingEvidence.join(' ')}`)
  const anchorHasHumanActor = hasAny(anchorContext, ['crew', 'pilot', 'captain', 'first officer', 'tripulacao', 'tripulação', 'comandante', 'copiloto', 'piloto', 'outro piloto', 'outro tripulante', 'o cara', 'eu', 'pic', 'sic', 'cco', 'dov', 'dispatcher', 'despachante'])
  const systemDominant = input.unsafeActOrCondition.type === 'UNSAFE_CONDITION' &&
    !anchorHasHumanActor &&
    hasAny(anchorContext, ['technical condition', 'system failure', 'automation failure', 'rudder movement', 'microburst', 'windshear'])

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
      actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
        ? 'O ator direto permanece não resolvido até que o ponto de fuga seja estabelecido; atores de detecção ou recuperação pós-ponto de fuga não podem ser promovidos apenas por saliência narrativa.'
        : 'Direct actor remains unresolved until the escape point is established; post-escape detection or recovery actors must not be promoted by salience alone.'],
    }
  }

  const semanticActors = [...new Set((input.engineInput.semanticEvidence ?? [])
    .filter((annotation) => annotation.actor && annotation.assertionStatus === 'AFFIRMED')
    .filter((annotation) => normalizeText(annotation.sourceQuote) === escapeText)
    .filter((annotation) => annotation.roles.includes('DIRECT_ACTOR') || annotation.roles.includes('CRITICAL_UNSAFE_ACT'))
    .map((annotation) => annotation.actor!.trim())
    .filter(Boolean))]
  if (semanticActors.length === 1) {
    return {
      actor: semanticActors[0],
      status: 'IDENTIFIED',
      alternatives: [],
      actorMigrationWarnings: [],
    }
  }
  if (semanticActors.length > 1) {
    return {
      actor: null,
      status: 'AMBIGUOUS',
      alternatives: semanticActors,
      actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
        ? 'A extração semântica encontrou mais de um ator explicitamente associado ao ato crítico; é necessária revisão humana antes da travessia P/O/A.'
        : 'Semantic extraction found more than one actor explicitly associated with the critical act; human review is required before P/O/A traversal.'],
    }
  }

  if (!systemDominant) {
    // Dispatch/release sentences can name several decision actors (e.g. CCO, DOV and PIC).
    // Resolve that collective attribution before generic captain/copilot logic so the presence of
    // PIC does not collapse a multi-actor dispatch act into a single cockpit actor.
    const escapeIsDispatchDecision = /\b(despach\w*|dispatch\w*|mel)\b/.test(escapeText)
    const dispatchDeparture = isExplicitOperationalOmissionStatement(primaryEscape) || isExplicitOperationalDeviationStatement(primaryEscape)
    if (dispatchDeparture && escapeIsDispatchDecision) {
      const explicitDispatchActors = [
        /\bcco\b/.test(escapeText) ? 'CCO' : null,
        /\bdov\b/.test(escapeText) ? 'DOV' : null,
        /\bpic\b/.test(escapeText) ? 'PIC' : null,
        /\b(?:dispatcher|despachante)\b/.test(escapeText) ? (input.engineInput.locale === 'pt-BR' ? 'despachante operacional' : 'dispatcher') : null,
      ].filter((actor): actor is string => Boolean(actor))
      if (explicitDispatchActors.length === 1) {
        return { actor: explicitDispatchActors[0], status: 'IDENTIFIED', alternatives: [], actorMigrationWarnings: [] }
      }
      if (explicitDispatchActors.length > 1) {
        return {
          actor: 'operational decision actors (collective)',
          status: 'AMBIGUOUS',
          alternatives: explicitDispatchActors,
          actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
            ? 'A própria frase que define o ato de despacho atribui a decisão/omissão a mais de um ator; P/O/A permanecem bloqueados até decomposição por ator.'
            : 'The dispatch-act sentence itself attributes the decision/omission to more than one actor; P/O/A remains blocked until actor decomposition.'],
        }
      }
      return {
        actor: null,
        status: 'AMBIGUOUS',
        alternatives: [input.engineInput.locale === 'pt-BR' ? 'responsável pelo despacho/liberação operacional' : 'actor responsible for operational dispatch/release'],
        actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
          ? 'O ato de despacho está sustentado, mas a frase factual não identifica quem o autorizou, executou ou ratificou. Atores citados em outros fatos não podem ser importados para preencher essa lacuna.'
          : 'The dispatch act is supported, but the factual sentence does not identify who authorized, executed, or ratified it. Actors named in other facts cannot be imported to fill that gap.'],
      }
    }
    // Conversational interviews frequently identify the actor by deixis/coreference rather than
    // formal role labels. Resolve the grammatical actor of the P/O/A anchor before whole-report
    // role fallback, otherwise a salient copilot/captain mention elsewhere migrates the act.
    if (escapeHasOtherPilot) {
      return {
        actor: input.engineInput.locale === 'pt-BR' ? 'outro piloto' : 'other pilot',
        status: 'IDENTIFIED',
        alternatives: input.engineInput.locale === 'pt-BR' ? ['piloto em adaptação', 'tripulação'] : ['pilot in transition training', 'flight crew'],
        actorMigrationWarnings: [],
      }
    }
    if (escapeHasNarratorAct) {
      return {
        actor: input.engineInput.locale === 'pt-BR' ? 'piloto entrevistado' : 'interviewed pilot',
        status: 'IDENTIFIED',
        alternatives: input.engineInput.locale === 'pt-BR' ? ['tripulação'] : ['flight crew'],
        actorMigrationWarnings: [],
      }
    }

    // Actor attribution is anchored first to the sentence that defines the P/O/A critical-act candidate.
    // A decision explicitly narrated in the first-person plural is a genuinely joint crew decision.
    // Keep it collective rather than inventing an individual PF/PM attribution.
    if (escapeHasJointDecision) {
      return {
        actor: input.engineInput.locale === 'pt-BR' ? 'tripulação (decisão conjunta)' : 'flight crew (joint decision)',
        status: 'IDENTIFIED',
        alternatives: input.engineInput.locale === 'pt-BR' ? ['piloto 1', 'piloto 2'] : ['pilot 1', 'pilot 2'],
        actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
          ? 'A própria frase da âncora P/O/A atribui a decisão à tripulação em conjunto; P/O/A permanece coletivo somente para essa decisão compartilhada.'
          : 'The P/O/A anchor sentence itself attributes the decision jointly to the crew; P/O/A stays collective only for that shared decision.'],
      }
    }
    // Explicit numbered pilot labels in operational narratives are actor identities, not generic
    // mentions. Preserve them so a later critical act by "piloto 2" is not collapsed to "pilot".
    const numberedPilot = escapeText.match(/\bpiloto\s*([12])\b/)
    if (numberedPilot?.[1]) {
      return {
        actor: `piloto ${numberedPilot[1]}`,
        status: 'IDENTIFIED',
        alternatives: ['tripulação'],
        actorMigrationWarnings: [],
      }
    }
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
        actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
          ? 'O ponto de fuga está ancorado na atividade de pré-voo/manutenção, mas o responsável individual não foi identificado; não migre a atribuição para a tripulação de voo que detectou ou recuperou a condição posteriormente.'
          : 'The escape point is anchored to preflight/maintenance activity, but the responsible maintenance actor is not identified; do not migrate attribution to post-escape flight-crew detection or recovery.'],
      }
    }
    const directControlResponse = isDirectControlResponseStatement(primaryEscape)
    if (directControlResponse && !escapeHasCopilot && !escapeHasCaptain && !escapeHasCollectiveCrew) {
      return {
        actor: null,
        status: 'AMBIGUOUS',
        alternatives: [input.engineInput.locale === 'pt-BR' ? 'tripulante que aplicou o comando' : 'crewmember who applied the control input'],
        actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
          ? 'O ato crítico de comando está sustentado, mas a frase factual selecionada não identifica quem aplicou o comando. A posição física do comando ou menções a outros tripulantes em fatos adjacentes não bastam para atribuir o ator.'
          : 'The critical control act is supported, but the selected factual sentence does not identify who applied the input. Control-side position or mentions of other crewmembers in adjacent facts are insufficient for actor attribution.'],
      }
    }
    const passiveOperationalDeparture = isExplicitOperationalOmissionStatement(primaryEscape)
      || isExplicitOperationalDeviationStatement(primaryEscape)
    if (passiveOperationalDeparture && !escapeHasCopilot && !escapeHasCaptain && !escapeHasMaintenance) {
      const escapeIsDispatchDecision = /\b(despach\w*|dispatch\w*|mel)\b/.test(escapeText)
      const explicitDispatchActors = [
        /\bcco\b/.test(escapeText) ? 'CCO' : null,
        /\bdov\b/.test(escapeText) ? 'DOV' : null,
        /\bpic\b/.test(escapeText) ? 'PIC' : null,
        /\b(?:dispatcher|despachante)\b/.test(escapeText) ? (input.engineInput.locale === 'pt-BR' ? 'despachante operacional' : 'dispatcher') : null,
      ].filter((actor): actor is string => Boolean(actor))

      if (escapeIsDispatchDecision) {
        if (explicitDispatchActors.length === 1) {
          return { actor: explicitDispatchActors[0], status: 'IDENTIFIED', alternatives: [], actorMigrationWarnings: [] }
        }
        if (explicitDispatchActors.length > 1) {
          return {
            actor: 'operational decision actors (collective)',
            status: 'AMBIGUOUS',
            alternatives: explicitDispatchActors,
            actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
              ? 'A própria frase que define o ponto de fuga atribui a decisão/omissão a mais de um ator de despacho; P/O/A permanecem bloqueados até decomposição por ator.'
              : 'The escape-point sentence itself attributes the decision/omission to more than one dispatch actor; P/O/A remains blocked until actor decomposition.'],
          }
        }
        return {
          actor: null,
          status: 'AMBIGUOUS',
          alternatives: [input.engineInput.locale === 'pt-BR' ? 'responsável pelo despacho/liberação operacional' : 'actor responsible for operational dispatch/release'],
          actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
            ? 'O despacho sem as restrições aplicáveis está sustentado, mas a frase factual que define o ponto de fuga não identifica quem o autorizou, executou ou ratificou. Atores citados em outros fatos não podem ser importados para preencher essa lacuna.'
            : 'Dispatch without the applicable restrictions is supported, but the factual escape-point sentence does not identify who authorized, executed, or ratified it. Actors named in other facts cannot be imported to fill that gap.'],
        }
      }

      if (/\b(checklist|qrh|de-icing|airframe|icing|gelo|cruise speed|degraded performance|increase speed)\b/.test(escapeText)) {
        return {
          actor: null,
          status: 'AMBIGUOUS',
          alternatives: [input.engineInput.locale === 'pt-BR' ? 'tripulante responsável pelo procedimento' : 'crewmember responsible for the procedure'],
          actorMigrationWarnings: [input.engineInput.locale === 'pt-BR'
            ? 'A omissão operacional no ponto de fuga está sustentada, mas a própria frase não identifica qual tripulante era responsável pela execução. O ator não pode ser inferido a partir de fatos de suporte de outro momento.'
            : 'The operational omission at the escape point is supported, but the sentence itself does not identify which crewmember was responsible for execution. The actor cannot be inferred from support facts from another moment.'],
        }
      }
    }
    const genericPilotUnsafeAction = /\bpiloto\b.{0,120}\b(iniciou|iniciado|iniciada|executou|continuou|prosseguiu|manteve|selecionou|moveu|desceu|subiu|initiated|executed|continued|proceeded|maintained|selected|moved|descended|climbed)\b/.test(escapeText)
      || /\bpiloto\b.{0,120}\b(nao notou|nao percebeu|nao processou|nao monitorou|nao verificou|did not notice|did not perceive|did not process|did not monitor|did not verify)\b/.test(escapeText)
    if (genericPilotUnsafeAction && !escapeHasCaptain && !escapeHasCollectiveCrew) {
      return { actor: 'piloto', status: 'IDENTIFIED', alternatives: ['tripulação'], actorMigrationWarnings: [] }
    }
    if (escapeHasCopilot && escapeHasCaptain) {
      return {
        actor: 'flight crew (collective)',
        status: 'AMBIGUOUS',
        alternatives: ['comandante', 'copiloto'],
        actorMigrationWarnings: ['O ponto de fuga menciona mais de um tripulante; a travessia P/O/A permanece bloqueada até identificar quem executou ou decidiu a ação relevante.'],
      }
    }
    if (escapeHasCollectiveCrew && !escapeHasCopilot && !escapeHasCaptain) {
      const pfExecution =
        /\b(iniciou|iniciaram|executou|executaram|conduziu|conduziram|alinhou|alinharam|desceu|desceram|subiu|subiram|aplicou|aplicaram)\b.*\b(aproxima[cç][aã]o|pouso|decolagem|manobra|controle|comando|descida|subida)\b/.test(escapeText) ||
        /\b(identificou|identificaram|confundiu|confundiram|associou|associaram|tratou|trataram)\b.*\b(destino|unidade|plataforma|pista|helideck|pouso)\b/.test(escapeText) ||
        /\b(passou|passaram)\s+a\s+(?:conduzir|preparar|aproximar|alinhar|descer)\b.*\b(unidade|plataforma|pista|helideck|destino|unit-[a-z0-9-]+)\b/.test(escapeText)
      if (pfExecution && copilotPf !== captainPf) {
        const actor = copilotPf ? 'copiloto (PF)' : 'comandante (PF)'
        const monitoringActor = copilotPf ? 'comandante (PM)' : 'copiloto (PM)'
        return {
          actor,
          status: 'IDENTIFIED',
          alternatives: ['tripulação', monitoringActor],
          actorMigrationWarnings: [
            `${monitoringActor} permanece como ator contributivo de monitoramento/barreira. O P/O/A principal fica ancorado no PF porque é o executor do compromisso operacional no ponto de fuga; a falha da barreira PF–PM deve ser registrada separadamente e não absorvida no mesmo ator.`,
          ],
        }
      }
      return {
        actor: 'flight crew (collective)',
        status: 'AMBIGUOUS',
        alternatives: ['comandante', 'copiloto', 'PF', 'PM'],
        actorMigrationWarnings: ['Atribuição coletiva de tripulação não é suficiente para fechar P/O/A; é necessária decomposição por ator direto.'],
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
        status: 'AMBIGUOUS',
        alternatives: ['captain', 'first officer', 'PF', 'PM'],
        actorMigrationWarnings: ['Collective crew attribution is not sufficient to close P/O/A; identify the direct actor at the escape point.'],
      }
    }
    if (hasAny(text, ['the pilot', 'pilot decided', 'pilot moved', 'pilot continued', 'o piloto', 'piloto decidiu', 'piloto moveu', 'piloto continuou', 'piloto perdeu', 'piloto iniciou'])) {
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
    status: legacy.actorKind === 'crew_collective' ? 'AMBIGUOUS' : legacy.actor ? 'IDENTIFIED' : 'AMBIGUOUS',
    alternatives: legacy.actorKind === 'crew_collective' ? ['captain', 'first officer', 'PF', 'PM'] : [],
    actorMigrationWarnings:
      legacy.actorKind === 'crew_collective'
        ? ['Collective crew attribution is not sufficient to close P/O/A; identify the direct actor at the escape point.']
        : legacy.actorKind === 'unknown' ? ['Direct actor remains unresolved; avoid actor migration beyond available evidence.'] : [],
  }
}
