import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { confidenceFromCount, hasAny, normalizeText } from '../utils'

export function runStep02SafeOperationModel(input: {
  engineInput: SeraVNextEngineInput
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
}): SeraVNextEngineOutput['safeOperationModel'] {
  const text = normalizeText(input.engineInput.narrative)
  const evidence = input.factualExtraction.facts
    .filter((fact) => ['decision', 'warning', 'cue', 'condition', 'action'].includes(fact.category))
    .slice(0, 4)
    .map((fact) => fact.statement)

  let expectedSafeState: string | null = null
  let expectedSafeAction: string | null = null

  if (hasAny(text, ['wrong deck', 'wrong destination', 'plataforma nao prevista', 'plataforma não prevista', 'unidade nao prevista', 'unidade não prevista', 'pouso nao autorizado', 'pouso não autorizado'])) {
    expectedSafeState = 'A operação deveria permanecer orientada para o destino planejado, com identificação positiva da unidade antes de comprometer a aproximação final.'
    expectedSafeAction = 'Prosseguir para a unidade planejada e reconfirmar visualmente a identificação do destino antes da aproximação/pouso.'
  } else if (hasAny(text, ['wrong runway', 'runway lineup', 'wrong taxiway'])) {
    expectedSafeState = 'A aeronave deveria permanecer alinhada apenas à pista correta e verificada.'
    expectedSafeAction = 'Interromper o alinhamento indevido e reconfirmar pista, autorização e referências.'
  } else if (hasAny(text, ['unstable approach', 'below glide path', 'high rate of descent', 'low airspeed'])) {
    expectedSafeState = 'A operação deveria permanecer estabilizada e dentro do perfil seguro de aproximação.'
    expectedSafeAction = 'Executar arremetida ou estabilização imediata ao primeiro sinal de perda do perfil seguro.'
  } else if (hasAny(text, ['warning', 'alert', 'automation', 'fmc'])) {
    expectedSafeState = 'O sistema e a tripulação deveriam permanecer em estado monitorado e verificável.'
    expectedSafeAction = 'Conter a progressão do evento, revalidar o modo/configuração e reestabelecer o controle seguro.'
  } else {
    expectedSafeState = 'A operação deveria permanecer dentro das referências, limites e controles seguros disponíveis.'
    expectedSafeAction = 'Manter o curso seguro esperado e interromper a progressão ao primeiro desvio relevante.'
  }

  return {
    expectedSafeState,
    expectedSafeAction,
    evidence,
    confidence: confidenceFromCount(evidence.length),
  }
}
