import type {
  SeraClarificationQuestion,
  SeraEvidenceSufficiencyGate,
  SeraVNextEngineOutput,
} from '../../engine-contract'

function questionForNode(nodeId: string, canonicalQuestion: string): Omit<SeraClarificationQuestion, 'id' | 'blocking'> {
  const common = {
    linkedNodeId: nodeId,
    whyNeeded: `A evidência disponível não permite responder o nó canônico ${nodeId} sem inferência.`,
  }
  const map: Record<string, { stage: SeraClarificationQuestion['stage']; question: string; requestedEvidence: string[] }> = {
    P_ROOT: {
      stage: 'PERCEPTION',
      question: 'No momento do ponto de fuga, o que o operador acreditava que estava acontecendo? Quais indicações, referências, alertas ou informações sustentavam essa percepção?',
      requestedEvidence: ['relato do operador', 'indicações/alertas disponíveis', 'sequência imediatamente anterior ao ponto de fuga'],
    },
    P_ASSESSMENT: {
      stage: 'PERCEPTION',
      question: 'A avaliação que o operador fazia da situação estava correta naquele momento? Informe o que ele percebeu e o que de fato estava acontecendo.',
      requestedEvidence: ['percepção declarada/observável', 'estado real da operação no mesmo momento'],
    },
    P_CAPABILITY: {
      stage: 'PERCEPTION',
      question: 'Havia alguma limitação sensorial/perceptiva ou falta de conhecimento/familiaridade que impedisse interpretar corretamente a situação? Qual evidência demonstra isso?',
      requestedEvidence: ['condição sensorial/ambiental', 'treinamento/familiaridade/conhecimento explicitamente documentados'],
    },
    P_TIME_PRESSURE: {
      stage: 'PERCEPTION',
      question: 'Havia pressão de tempo excessiva antes do ponto de fuga? Qual era a urgência, prazo ou janela operacional concreta?',
      requestedEvidence: ['restrição temporal observável', 'efeito da urgência sobre a avaliação da situação'],
    },
    P_INFORMATION_AMBIGUOUS: {
      stage: 'PERCEPTION',
      question: 'A informação apresentada ao operador era ambígua, ilusória ou conflitante? Quais sinais ou fontes estavam disponíveis?',
      requestedEvidence: ['conteúdo das fontes/sinais', 'eventuais conflitos ou ambiguidades entre informações'],
    },
    P_INFORMATION_AVAILABLE: {
      stage: 'PERCEPTION',
      question: 'A informação necessária estava disponível e correta antes do ponto de fuga? Onde ela aparecia e houve monitoramento ou cross-check?',
      requestedEvidence: ['informação disponível antes do ponto de fuga', 'monitoramento/cross-check realizado ou omitido'],
    },
    O_ROOT: {
      stage: 'OBJECTIVE',
      question: 'Qual era a intenção ou o objetivo concreto do ator no momento do ponto de fuga?',
      requestedEvidence: ['objetivo declarado', 'decisão ou intenção observável antes da ação'],
    },
    O_RULES: {
      stage: 'OBJECTIVE',
      question: 'O ator conhecia a regra, procedimento ou limite aplicável e sabia se o objetivo escolhido era compatível com ele?',
      requestedEvidence: ['regra/procedimento aplicável', 'evidência de conhecimento e consciência do ator'],
    },
    O_ROUTINE: {
      stage: 'OBJECTIVE',
      question: 'Se houve desvio consciente, ele era uma prática habitual/normalizada ou uma decisão excepcional neste evento?',
      requestedEvidence: ['histórico de repetição/tolerância', 'evidência de caráter rotineiro ou excepcional'],
    },
    O_MANAGED_RISK: {
      stage: 'OBJECTIVE',
      question: 'Que risco o objetivo aceitava e como o ator pretendia gerenciá-lo ou limitá-lo? Havia pressão operacional, produtiva ou temporal?',
      requestedEvidence: ['risco conhecido no momento', 'meta operacional perseguida', 'medidas de limitação/gestão do risco'],
    },
    A_ROOT: {
      stage: 'ACTION',
      question: 'Qual ação ou omissão concreta o ator executou para tentar atingir o objetivo no ponto de fuga?',
      requestedEvidence: ['comando/ação/omissão observável', 'vínculo entre ator e ação'],
    },
    A_IMPLEMENTED: {
      stage: 'ACTION',
      question: 'A ação executada correspondeu ao que o ator pretendia fazer? Houve deslize, lapso, erro de execução ou omissão?',
      requestedEvidence: ['ação pretendida', 'ação efetivamente executada', 'diferença entre intenção e execução'],
    },
    A_CORRECT: {
      stage: 'ACTION',
      question: 'A ação escolhida era adequada à situação percebida? Quais alternativas estavam disponíveis naquele momento?',
      requestedEvidence: ['ação selecionada', 'alternativas operacionalmente disponíveis', 'adequação à situação percebida'],
    },
    A_CAPABILITY: {
      stage: 'ACTION',
      question: 'O ator possuía capacidade, conhecimento e habilidade para executar a resposta apropriada? Qual evidência sustenta essa resposta?',
      requestedEvidence: ['qualificação/capacidade relevante', 'limitação física, ergonômica, de conhecimento ou habilidade'],
    },
    A_TIME_PRESSURE: {
      stage: 'ACTION',
      question: 'A execução da ação foi afetada por pressão de tempo excessiva? Qual era a urgência e como ela alterou a seleção ou o momento da resposta?',
      requestedEvidence: ['restrição temporal', 'momento da ação', 'efeito concreto da urgência'],
    },
  }
  const found = map[nodeId]
  if (found) return { ...common, ...found }
  return {
    ...common,
    stage: nodeId.startsWith('P_') ? 'PERCEPTION' : nodeId.startsWith('O_') ? 'OBJECTIVE' : 'ACTION',
    question: `Para responder ao nó “${canonicalQuestion}”, qual evidência factual do evento está disponível?`,
    requestedEvidence: ['fato observável anterior ou no ponto de fuga que responda diretamente ao nó'],
  }
}

function uniqueQuestions(items: SeraClarificationQuestion[]): SeraClarificationQuestion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.stage}|${item.linkedNodeId ?? ''}|${item.question}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function runStep10EvidenceSufficiency(input: {
  safeOperationModel: SeraVNextEngineOutput['safeOperationModel']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  canonicalTraversal: SeraVNextEngineOutput['canonicalTraversal']
  axes: SeraVNextEngineOutput['axes']
}): SeraEvidenceSufficiencyGate {
  if (input.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') {
    return {
      status: 'NO_HUMAN_ESCAPE_POINT',
      minimumEvidenceSatisfied: true,
      blockingReasons: [],
      questions: [],
    }
  }

  const questions: SeraClarificationQuestion[] = []
  const blockingReasons: string[] = []

  if (!input.safeOperationModel.expectedSafeState && !input.safeOperationModel.expectedSafeAction) {
    blockingReasons.push('SAFE_OPERATION_REFERENCE_MISSING')
    questions.push({
      id: 'CLARIFY-SAFE-OPERATION',
      stage: 'SAFE_OPERATION',
      blocking: true,
      linkedNodeId: null,
      question: 'Qual era o estado ou a ação operacional segura esperada naquele momento do evento?',
      whyNeeded: 'Sem uma referência de operação segura não é possível estabelecer de forma defensável quando ocorreu a primeira saída desse estado.',
      requestedEvidence: ['procedimento/planejamento aplicável', 'estado ou ação esperada antes do desvio'],
    })
  }

  if (input.escapePoint.status === 'INSUFFICIENT_EVIDENCE') {
    blockingReasons.push('ESCAPE_POINT_NOT_ESTABLISHED')
    questions.push({
      id: 'CLARIFY-ESCAPE-POINT',
      stage: 'ESCAPE_POINT',
      blocking: true,
      linkedNodeId: null,
      question: 'Qual foi a primeira ação, decisão ou omissão humana observável que desviou a operação do estado seguro? Descreva o que aconteceu imediatamente antes e imediatamente depois desse momento.',
      whyNeeded: 'P/O/A só podem ser analisados depois que o ponto de fuga da operação segura estiver sustentado por fatos anteriores ao resultado.',
      requestedEvidence: ['sequência temporal imediatamente anterior ao desvio', 'ação/decisão/omissão humana controlável', 'estado operacional logo após o desvio'],
    })
  }

  if (input.escapePoint.status !== 'INSUFFICIENT_EVIDENCE' && input.directActor.status === 'AMBIGUOUS') {
    blockingReasons.push('DIRECT_ACTOR_UNRESOLVED')
    questions.push({
      id: 'CLARIFY-DIRECT-ACTOR',
      stage: 'DIRECT_ACTOR',
      blocking: true,
      linkedNodeId: null,
      question: 'Quem executou ou comandou a ação no ponto de fuga? Se havia dois pilotos, informe quem era PF, quem era PM e quem realizou a ação ou tomou a decisão relevante.',
      whyNeeded: 'A análise P/O/A deve permanecer ancorada no ator diretamente ligado ao ponto de fuga; não é permitido migrar a causalidade para outro membro da equipe por inferência.',
      requestedEvidence: ['papéis PF/PM', 'ator que executou a ação', 'ator que tomou a decisão, quando diferente'],
    })
  }

  for (const path of input.canonicalTraversal.paths) {
    if (path.status === 'COMPLETED_CANDIDATE_ONLY') continue
    const last = [...path.answers].reverse().find((answer) => answer.answer === 'INSUFFICIENT_EVIDENCE') ?? path.answers[path.answers.length - 1]
    if (!last) continue
    const q = questionForNode(last.nodeId, last.question)
    blockingReasons.push(`${path.axis}_CANONICAL_NODE_UNANSWERED:${last.nodeId}`)
    questions.push({
      id: `CLARIFY-${path.axis}-${last.nodeId}`,
      blocking: true,
      ...q,
    })
  }

  for (const [axis, candidate] of Object.entries(input.axes) as Array<[string, SeraVNextEngineOutput['axes']['perception']]>) {
    if (candidate.status === 'INSUFFICIENT_EVIDENCE' && !input.canonicalTraversal.paths.some((path) => path.axis === axis[0])) {
      blockingReasons.push(`${axis.toUpperCase()}_EVIDENCE_INSUFFICIENT`)
    }
  }

  const deduped = uniqueQuestions(questions)
  return {
    status: blockingReasons.length ? 'NEEDS_CLARIFICATION' : 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS',
    minimumEvidenceSatisfied: blockingReasons.length === 0,
    blockingReasons: [...new Set(blockingReasons)],
    questions: deduped,
  }
}
