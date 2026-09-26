import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { hasAny, normalizeText } from '../utils'

export function runStep02SafeOperationModel(input: {
  engineInput: SeraVNextEngineInput
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
}): SeraVNextEngineOutput['safeOperationModel'] {
  const eligibleEvidence = input.factualExtraction.evidence.filter((item) =>
    item.assertionStatus === 'AFFIRMED' &&
    item.temporalRelation !== 'POST_ESCAPE' &&
    item.relationshipToFailure !== 'POST_ESCAPE_CONSEQUENCE' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    !['OUTCOME', 'UNSUPPORTED_REPORT_ANALYSIS', 'NON_CAUSAL_DOCUMENT'].includes(item.evidenceType),
  )
  const text = normalizeText(eligibleEvidence.map((item) => item.statement).join(' '))
  const candidateEvidence = [...new Set(
    eligibleEvidence
      .filter((item) =>
        item.evidenceType === 'REFERENCE_PROCEDURE' ||
        item.evidenceType === 'ACTION_OR_DECISION' ||
        item.evidenceType === 'REPORTED_CUE' ||
        ['decision', 'warning', 'cue', 'condition', 'action'].includes(item.category),
      )
      .map((item) => item.statement),
  )].slice(0, 4)

  let expectedSafeState: string | null = null
  let expectedSafeAction: string | null = null
  let evidenceTheme: RegExp | null = null

  if (hasAny(text, ['wrong deck', 'wrong destination', 'plataforma nao prevista', 'plataforma não prevista', 'unidade nao prevista', 'unidade não prevista', 'pouso nao autorizado', 'pouso não autorizado'])) {
    expectedSafeState = 'A operação deveria permanecer orientada para o destino planejado, com identificação positiva da unidade antes de comprometer a aproximação final.'
    expectedSafeAction = 'Prosseguir para a unidade planejada e reconfirmar visualmente a identificação do destino antes da aproximação/pouso.'
    evidenceTheme = /destino|unidade|plataforma|pista|helideck|gps|rota|autoriza[cç][aã]o/i
  } else if (hasAny(text, ['wrong runway', 'runway lineup', 'wrong taxiway'])) {
    expectedSafeState = 'A aeronave deveria permanecer alinhada apenas à pista correta e verificada.'
    expectedSafeAction = 'Interromper o alinhamento indevido e reconfirmar pista, autorização e referências.'
    evidenceTheme = /runway|taxiway|pista|alinh|autoriza[cç][aã]o/i
  } else if (hasAny(text, ['unstable approach', 'below glide path', 'high rate of descent', 'low airspeed'])) {
    expectedSafeState = 'A operação deveria permanecer estabilizada e dentro do perfil seguro de aproximação.'
    expectedSafeAction = 'Executar arremetida ou estabilização imediata ao primeiro sinal de perda do perfil seguro.'
    evidenceTheme = /approach|aproxima[cç][aã]o|glide|perfil|velocidade|airspeed|descida|descent/i
  } else if (hasAny(text, ['severe icing', 'icing conditions', 'formação de gelo severo', 'formacao de gelo severo', 'de-icing', 'airframe de-icing'])) {
    expectedSafeState = 'A aeronave deveria permanecer dentro das limitações e margens de desempenho aplicáveis à formação de gelo, com os sistemas de proteção disponíveis e as restrições operacionais respeitadas.'
    expectedSafeAction = 'Aplicar os procedimentos de gelo/falha aplicáveis e abandonar ou evitar a condição quando a proteção ou a margem requerida não puder ser assegurada.'
    evidenceTheme = /ice|icing|gelo|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed|mel|meteorolog|sigmet/i
  } else if (hasAny(text, ['warning', 'alert', 'automation', 'fmc'])) {
    expectedSafeState = 'O sistema e a tripulação deveriam permanecer em estado monitorado e verificável.'
    expectedSafeAction = 'Conter a progressão do evento, revalidar o modo/configuração e reestabelecer o controle seguro.'
    evidenceTheme = /warning|alert|automation|fmc|alerta|automa[cç][aã]o|modo|configura[cç][aã]o/i
  } else {
    expectedSafeState = 'A operação deveria permanecer dentro das referências, limites e controles seguros disponíveis.'
    expectedSafeAction = 'Manter o curso seguro esperado e interromper a progressão ao primeiro desvio relevante.'
  }

  const themedEvidence = evidenceTheme ? candidateEvidence.filter((statement) => evidenceTheme!.test(statement)) : candidateEvidence
  const evidence = (themedEvidence.length ? themedEvidence : candidateEvidence).slice(0, 4)

  const referenceCount = eligibleEvidence.filter((item) => item.evidenceType === 'REFERENCE_PROCEDURE').length
  const eventCount = eligibleEvidence.filter((item) => ['ACTION_OR_DECISION', 'REPORTED_CUE'].includes(item.evidenceType)).length
  const confidence = referenceCount > 0 && eventCount > 0 ? 'HIGH' : referenceCount > 0 || eventCount > 0 ? 'MEDIUM' : 'LOW'

  return {
    expectedSafeState,
    expectedSafeAction,
    evidence,
    confidence,
  }
}
