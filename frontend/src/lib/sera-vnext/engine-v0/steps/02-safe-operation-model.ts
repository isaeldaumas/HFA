import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { hasAny, normalizeText } from '../utils'

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isNormativeSafeReference(statement: string): boolean {
  const text = normalized(statement)
  return /\b(qrh|afm|fcom|mel|manual|procedimento|procedure|checklist|orientacao|orientacao do qrh|limite|limitacao|restriction)\b/.test(text)
    && /\b(deveria|nao deveria|devia|era necessario|era obrigatorio|estabelecia|determinava|previa|exigia|requeria|required|mandated|specified|stated|should|must|must not|proibia|proibido)\b/.test(text)
}

export function runStep02SafeOperationModel(input: {
  engineInput: SeraVNextEngineInput
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint?: SeraVNextEngineOutput['escapePoint']
}): SeraVNextEngineOutput['safeOperationModel'] {
  const semanticSafe = input.engineInput.semanticSafeOperationModel
  if (semanticSafe?.expectedSafeState && semanticSafe.expectedSafeAction && semanticSafe.evidenceQuotes.length > 0) {
    return {
      expectedSafeState: semanticSafe.expectedSafeState,
      expectedSafeAction: semanticSafe.expectedSafeAction,
      evidence: semanticSafe.evidenceQuotes,
      confidence: semanticSafe.confidence,
    }
  }
  const eligibleEvidence = input.factualExtraction.evidence.filter((item) =>
    item.assertionStatus === 'AFFIRMED' &&
    item.temporalRelation !== 'POST_ESCAPE' &&
    item.relationshipToFailure !== 'POST_ESCAPE_CONSEQUENCE' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    !['OUTCOME', 'UNSUPPORTED_REPORT_ANALYSIS', 'NON_CAUSAL_DOCUMENT'].includes(item.evidenceType),
  )
  const anchor = normalized(input.escapePoint?.firstDepartureCandidate ?? input.escapePoint?.statement ?? input.escapePoint?.earliestCandidate ?? input.escapePoint?.criticalUnsafeActCandidate ?? input.escapePoint?.latestCandidate ?? '')
  const corpus = normalizeText(eligibleEvidence.map((item) => item.statement).join(' '))
  const text = `${anchor} ${corpus}`

  let expectedSafeState: string | null = null
  let expectedSafeAction: string | null = null
  let evidenceTheme: RegExp | null = null

  if (/\b(stick pusher|stall warning|stall protection|nose up|nose down|cabrar|picar|aoa)\b/.test(anchor)) {
    expectedSafeState = 'A aeronave deveria permanecer com o ângulo de ataque sob controle, sem oposição aos comandos automáticos de proteção contra stall e dentro da trajetória de recuperação prevista.'
    expectedSafeAction = 'Durante a atuação do stick pusher, não aplicar comando contrário; reduzir o ângulo de ataque e executar a recuperação de stall prevista no QRH/procedimento aplicável.'
    evidenceTheme = /stick pusher|stall|nose up|nose down|cabrar|picar|aoa|recupera[cç][aã]o|recovery/i
  } else if (/\b(despach|dispatch|mel|operational release|liberacao operacional)\b/.test(anchor)) {
    expectedSafeState = 'A aeronave somente deveria ser liberada para o voo dentro das condições de aeronavegabilidade e das restrições operacionais aplicáveis.'
    expectedSafeAction = 'Efetuar o despacho/liberação somente em conformidade com a MEL aplicável, incluindo as restrições, ações de manutenção e condições operacionais requeridas.'
    evidenceTheme = /mel|despach|dispatch|libera[cç][aã]o|operational release|restri[cç][aã]o|restriction/i
  } else if (/\b(preflight|pre-voo|inspecao|maintenance|manutencao)\b/.test(anchor)) {
    expectedSafeState = 'A aeronave deveria ser liberada apenas após a condição inspecionada estar verificada e compatível com o procedimento de manutenção/pré-voo aplicável.'
    expectedSafeAction = 'Executar e confirmar os passos de inspeção, fechamento, travamento ou verificação previstos antes da liberação da aeronave.'
    evidenceTheme = /pre[- ]?voo|preflight|inspe[cç][aã]o|maintenance|manuten[cç][aã]o|verifica[cç][aã]o|travamento|latch/i
  } else if (
    /\b(imc|condi[cç][oõ]es? n[aã]o visuais?|non[- ]?visual|instrument meteorological)\b/.test(text) &&
    /\b(aproxima[cç][aã]o|approach|pouso|landing|plataforma|helideck|continuar|prosseguir|continue|proceed)\b/.test(text)
  ) {
    expectedSafeState = 'A aproximação deveria permanecer dentro dos critérios meteorológicos e operacionais aplicáveis, preservando altitude/margem e as referências visuais exigidas antes de comprometer a continuação para o pouso.'
    expectedSafeAction = 'Não prosseguir abaixo ou além dos critérios aplicáveis sem as referências requeridas; manter o perfil seguro por instrumentos ou descontinuar a tentativa até que as condições para prosseguir estejam satisfeitas.'
    evidenceTheme = /imc|teto|ceiling|visibilidade|visibility|minim[oa]|minimum|aproxima[cç][aã]o|approach|pouso|landing|refer[eê]ncia visual|visual reference/i
  } else if (hasAny(text, ['wrong deck', 'wrong destination', 'plataforma nao prevista', 'plataforma não prevista', 'unidade nao prevista', 'unidade não prevista', 'pouso nao autorizado', 'pouso não autorizado'])) {
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

  const proceduralEvidence = eligibleEvidence.filter((item) =>
    item.evidenceType === 'REFERENCE_PROCEDURE' || isNormativeSafeReference(item.statement),
  )
  const themedProcedural = evidenceTheme ? proceduralEvidence.filter((item) => evidenceTheme!.test(item.statement)) : proceduralEvidence
  const anchorCorroboration = eligibleEvidence.filter((item) =>
    evidenceTheme?.test(item.statement) &&
    /\b(contrariando|oposi[cç][aã]o|opposing|against|n[aã]o deveria|should not|deveria|should)\b/i.test(item.statement) &&
    !/\b(uprt|treinamento|training)\b/i.test(item.statement),
  )
  const evidence = [...new Set([...themedProcedural, ...anchorCorroboration].map((item) => item.statement))].slice(0, 4)

  const hasProceduralReference = themedProcedural.length > 0
  const hasEventCorroboration = anchorCorroboration.length > 0
  const confidence = hasProceduralReference && hasEventCorroboration ? 'HIGH' : hasProceduralReference || hasEventCorroboration ? 'MEDIUM' : 'LOW'

  return { expectedSafeState, expectedSafeAction, evidence, confidence }
}
