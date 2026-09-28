import type {
  SeraClarificationQuestion,
  SeraEvidenceSufficiencyGate,
  SeraVNextEngineOutput,
} from '../../engine-contract'
import { clarificationWhyNeeded, englishClarificationForNode } from '../clarification-i18n'

function questionForNode(nodeId: string, canonicalQuestion: string, locale: 'pt-BR' | 'en'): Omit<SeraClarificationQuestion, 'id' | 'blocking'> {
  const common = {
    linkedNodeId: nodeId,
    whyNeeded: clarificationWhyNeeded(nodeId, locale),
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
      question: 'Como o operador estava tentando atingir o objetivo? Qual era o plano, a estratégia ou o meio que pretendia usar naquele momento?',
      requestedEvidence: ['plano/estratégia declarado ou observável', 'meio escolhido para atingir o objetivo', 'vínculo entre a estratégia e o ator'],
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
  if (locale === 'en') {
    const english = englishClarificationForNode(nodeId)
    if (english) return { ...common, ...english }
    return {
      ...common,
      stage: nodeId.startsWith('P_') ? 'PERCEPTION' : nodeId.startsWith('O_') ? 'OBJECTIVE' : 'ACTION',
      question: `What factual event evidence is available to answer the canonical node “${canonicalQuestion}”?`,
      requestedEvidence: ['observable fact before or at the escape point that directly answers the node'],
    }
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

function directActorClarification(args: {
  escapePoint: SeraVNextEngineOutput['escapePoint']
  locale: 'pt-BR' | 'en'
}): Pick<SeraClarificationQuestion, 'question' | 'whyNeeded' | 'requestedEvidence'> {
  const anchor = `${args.escapePoint.criticalUnsafeActCandidate ?? args.escapePoint.statement ?? args.escapePoint.latestCandidate ?? args.escapePoint.earliestCandidate ?? ''}`.toLowerCase()
  const dispatchContext = /\b(despach|dispatch|mel|libera[cç][aã]o operacional|operational release)\w*/i.test(anchor)
  const maintenanceContext = /\b(manuten[cç][aã]o|maintenance|pre[- ]?voo|pr[eé][ -]?voo|preflight|inspetor|inspector|mec[aâ]nico|mechanic)\b/i.test(anchor)
  const flightCrewContext = /\b(tripula[cç][aã]o|flight crew|crew|piloto|pilot|comandante|captain|copiloto|first officer|pic|sic|pf|pm|checklist|qrh|de-icing|airframe|cruise speed|degraded performance|increase speed)\b/i.test(anchor)

  if (dispatchContext) {
    return args.locale === 'pt-BR'
      ? {
          question: 'Quem autorizou, executou ou ratificou o despacho/liberação operacional que constitui o ponto de fuga? Identifique o papel de cada ator diretamente vinculado a esse ato e a evidência que demonstra essa participação.',
          whyNeeded: 'P/O/A devem ser atribuídos ao ator do próprio ato de despacho. Atores citados em outros fatos, como avaliação meteorológica ou ações posteriores da tripulação, não podem ser importados por inferência.',
          requestedEvidence: ['registro de despacho/liberação operacional', 'aplicação ou dispensa das restrições da MEL', 'registro/TLB ou comunicação que identifique quem autorizou, executou ou ratificou o despacho'],
        }
      : {
          question: 'Who authorized, executed, or ratified the dispatch/operational release that constitutes the escape point? Identify each actor directly tied to that act and the evidence establishing that participation.',
          whyNeeded: 'P/O/A must be attributed to the actor of the dispatch act itself. Actors mentioned in other facts, such as weather assessment or later flight-crew actions, cannot be imported by inference.',
          requestedEvidence: ['dispatch/operational-release record', 'application or waiver of MEL restrictions', 'log/TLB or communication identifying who authorized, executed, or ratified the dispatch'],
        }
  }

  if (maintenanceContext) {
    return args.locale === 'pt-BR'
      ? {
          question: 'Quem executou, inspecionou ou liberou a atividade de manutenção/pré-voo que constitui o ponto de fuga? Identifique a função e a evidência que vincula essa pessoa ao ato.',
          whyNeeded: 'A análise P/O/A deve permanecer no executor ou decisor da atividade de manutenção/pré-voo, sem migrar para quem detectou a condição posteriormente.',
          requestedEvidence: ['ordem/registro de manutenção ou pré-voo', 'identificação do executor/inspetor/liberador', 'passo executado e eventual verificação independente'],
        }
      : {
          question: 'Who performed, inspected, or released the maintenance/preflight activity that constitutes the escape point? Identify the role and evidence linking that person to the act.',
          whyNeeded: 'P/O/A must remain anchored to the maintenance/preflight actor and must not migrate to someone who detected the condition later.',
          requestedEvidence: ['maintenance/preflight record', 'identity of performer/inspector/releaser', 'performed step and any independent verification'],
        }
  }

  if (flightCrewContext) {
    return args.locale === 'pt-BR'
      ? {
          question: 'Qual tripulante executou ou comandou a ação/omissão no ponto de fuga? Informe quem era PF, quem era PM e quem realizou a ação ou tomou a decisão relevante.',
          whyNeeded: 'A análise P/O/A deve permanecer ancorada no tripulante diretamente ligado ao ponto de fuga; não é permitido migrar a causalidade para outro membro da tripulação por inferência.',
          requestedEvidence: ['papéis PF/PM no momento', 'tripulante que executou a ação/omissão', 'tripulante que tomou a decisão, quando diferente'],
        }
      : {
          question: 'Which crewmember executed or directed the action/omission at the escape point? Identify PF, PM, and who performed the relevant action or made the decision.',
          whyNeeded: 'P/O/A must remain anchored to the crewmember directly connected to the escape point; causality cannot migrate to another crewmember by inference.',
          requestedEvidence: ['PF/PM roles at that moment', 'crewmember who performed the action/omission', 'crewmember who made the decision, when different'],
        }
  }

  return args.locale === 'pt-BR'
    ? {
        question: 'Quem executou, comandou ou tomou a decisão que constitui o ponto de fuga? Informe a função do ator e a evidência factual que o vincula diretamente a esse ato.',
        whyNeeded: 'A análise P/O/A deve permanecer ancorada no ator diretamente ligado ao ponto de fuga; atores de outros momentos do evento não podem preencher essa lacuna por inferência.',
        requestedEvidence: ['ator diretamente vinculado ao ato', 'função operacional no momento', 'registro ou relato factual que demonstre a participação'],
      }
    : {
        question: 'Who performed, directed, or made the decision that constitutes the escape point? Identify the actor role and factual evidence directly linking that actor to the act.',
        whyNeeded: 'P/O/A must remain anchored to the actor directly connected to the escape point; actors from other moments cannot fill this gap by inference.',
        requestedEvidence: ['actor directly linked to the act', 'operational role at that moment', 'record or factual account establishing participation'],
      }
}

export function runStep10EvidenceSufficiency(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  safeOperationModel: SeraVNextEngineOutput['safeOperationModel']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  canonicalTraversal: SeraVNextEngineOutput['canonicalTraversal']
  axes: SeraVNextEngineOutput['axes']
  guardrails?: SeraVNextEngineOutput['guardrails']
  locale: 'pt-BR' | 'en'
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
  const recordedClarificationsFor = (questionId: string): string[] =>
    input.factualExtraction.evidence
      .filter((item) => item.collectionSource === 'CLARIFICATION_RESPONSE' && item.linkedQuestionId === questionId)
      .map((item) => item.statement.trim())
      .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
  const compactRecorded = (values: string[]): string => {
    const joined = values.join(' | ').replace(/\s+/g, ' ').trim()
    return joined.length > 220 ? `${joined.slice(0, 217)}...` : joined
  }
  const maintenancePreflightContext =
    /\bmaintenance|manuten[cç][aã]o\b/i.test(input.directActor.actor ?? '') &&
    /\b(inspe[cç][aã]o (?:de )?pr[eé][ -]?voo|pr[eé][ -]?voo|preflight inspection)\b/i.test(
      `${input.escapePoint.criticalUnsafeActCandidate ?? input.escapePoint.statement ?? input.escapePoint.latestCandidate ?? input.escapePoint.earliestCandidate ?? ''}`,
    )

  if (!input.safeOperationModel.expectedSafeState && !input.safeOperationModel.expectedSafeAction) {
    blockingReasons.push('SAFE_OPERATION_REFERENCE_MISSING')
    questions.push({
      id: 'CLARIFY-SAFE-OPERATION',
      stage: 'SAFE_OPERATION',
      blocking: true,
      linkedNodeId: null,
      question: input.locale === 'pt-BR' ? 'Qual era o estado ou a ação operacional segura esperada naquele momento do evento?' : 'What safe operational state or action was expected at that moment of the event?',
      whyNeeded: input.locale === 'pt-BR' ? 'Sem uma referência de operação segura não é possível estabelecer de forma defensável quando ocorreu a primeira saída desse estado.' : 'Without a safe-operation reference, the first departure from the safe state cannot be established defensibly.',
      requestedEvidence: input.locale === 'pt-BR' ? ['procedimento/planejamento aplicável', 'estado ou ação esperada antes do desvio'] : ['applicable procedure/plan', 'expected state or action before the deviation'],
    })
  }

  if (input.escapePoint.status === 'INSUFFICIENT_EVIDENCE') {
    blockingReasons.push('ESCAPE_POINT_NOT_ESTABLISHED')
    questions.push({
      id: 'CLARIFY-ESCAPE-POINT',
      stage: 'ESCAPE_POINT',
      blocking: true,
      linkedNodeId: null,
      question: input.locale === 'pt-BR' ? 'Qual foi a primeira ação, decisão ou omissão humana observável que desviou a operação do estado seguro? Descreva o que aconteceu imediatamente antes e imediatamente depois desse momento.' : 'What was the first observable human action, decision, or omission that moved the operation away from the safe state? Describe what happened immediately before and after that moment.',
      whyNeeded: input.locale === 'pt-BR' ? 'P/O/A só podem ser analisados depois que o ponto de fuga da operação segura estiver sustentado por fatos anteriores ao resultado.' : 'P/O/A can only be analyzed after the safe-operation escape point is supported by facts that precede the outcome.',
      requestedEvidence: input.locale === 'pt-BR' ? ['sequência temporal imediatamente anterior ao desvio', 'ação/decisão/omissão humana controlável', 'estado operacional logo após o desvio'] : ['temporal sequence immediately before the deviation', 'controllable human action/decision/omission', 'operational state immediately after the deviation'],
    })
  }

  if (input.escapePoint.status !== 'INSUFFICIENT_EVIDENCE' && input.escapePoint.confidence === 'LOW') {
    blockingReasons.push('ESCAPE_POINT_LOW_CONFIDENCE')
    questions.push({
      id: 'CLARIFY-ESCAPE-POINT-CONFIDENCE',
      stage: 'ESCAPE_POINT',
      blocking: true,
      linkedNodeId: null,
      question: input.locale === 'pt-BR' ? 'Qual evidência factual confirma que este candidato é realmente a primeira saída controlável da operação segura?' : 'What factual evidence confirms that this candidate is truly the first controllable departure from safe operation?',
      whyNeeded: input.locale === 'pt-BR' ? 'Um ponto de fuga de baixa confiança não pode sustentar classificações P/O/A de confiança superior.' : 'A low-confidence escape point cannot support higher-confidence P/O/A classifications.',
      requestedEvidence: input.locale === 'pt-BR' ? ['ação/decisão/omissão observável', 'sequência imediatamente anterior', 'vínculo temporal com o início do estado inseguro'] : ['observable action/decision/omission', 'immediately preceding sequence', 'temporal link to the onset of the unsafe state'],
    })
  }

  if (input.escapePoint.status !== 'INSUFFICIENT_EVIDENCE' && input.directActor.status === 'AMBIGUOUS') {
    blockingReasons.push('DIRECT_ACTOR_UNRESOLVED')
    const actorQuestion = directActorClarification({ escapePoint: input.escapePoint, locale: input.locale })
    questions.push({
      id: 'CLARIFY-DIRECT-ACTOR',
      stage: 'DIRECT_ACTOR',
      blocking: true,
      linkedNodeId: null,
      ...actorQuestion,
    })
  }

  for (const path of input.canonicalTraversal.paths) {
    if (path.status === 'COMPLETED_CANDIDATE_ONLY') continue
    const last = [...path.answers].reverse().find((answer) => answer.answer === 'INSUFFICIENT_EVIDENCE') ?? path.answers[path.answers.length - 1]
    if (!last) continue
    const q = questionForNode(last.nodeId, last.question, input.locale)
    if (maintenancePreflightContext && last.nodeId === 'P_ROOT') {
      q.question = input.locale === 'pt-BR'
        ? 'Na inspeção pré-voo, o que o executor acreditava sobre a condição de fechamento/travamento daquela portinhola naquele momento?'
        : 'During the preflight inspection, what did the person performing the check believe about that access panel closure/locking condition at that moment?'
      q.requestedEvidence = input.locale === 'pt-BR'
        ? ['relato do executor sobre a condição que acreditava existir', 'base factual dessa percepção']
        : ['account of the condition the person believed existed', 'factual basis for that perception']
    }
    if (maintenancePreflightContext && last.nodeId === 'P_ASSESSMENT') {
      const priorPerception = recordedClarificationsFor('CLARIFY-P-P_ROOT')
      const recordedPrefix = priorPerception.length ? compactRecorded(priorPerception) : ''
      q.question = input.locale === 'pt-BR'
        ? (recordedPrefix
            ? `Você já informou sobre a percepção do executor: “${recordedPrefix}”. Para avaliar se essa percepção estava correta, qual evidência estabelece a condição real da portinhola no mesmo momento do pré-voo?`
            : 'Qual era a condição real da portinhola no momento da inspeção pré-voo e como ela se comparava ao que o executor acreditava ter verificado?')
        : (recordedPrefix
            ? `You already provided the operator perception: “${recordedPrefix}”. To assess whether that perception was correct, what evidence establishes the access panel actual condition at the same preflight moment?`
            : 'What was the access panel actual condition at the preflight inspection moment, and how did it compare with what the person believed had been verified?')
      q.requestedEvidence = input.locale === 'pt-BR'
        ? ['condição real no mesmo momento do pré-voo', 'verificação física/tátil, registro, testemunho ou outro dado contemporâneo', 'comparação entre estado percebido e estado real']
        : ['actual condition at the same preflight moment', 'physical/tactile check, record, witness account, or other contemporaneous evidence', 'comparison between perceived and actual state']
    }
    if (maintenancePreflightContext && last.nodeId === 'A_IMPLEMENTED') {
      const priorAction = recordedClarificationsFor('CLARIFY-A-A_IMPLEMENTED')
      const recordedPrefix = priorAction.length ? compactRecorded(priorAction) : ''
      q.question = input.locale === 'pt-BR'
        ? (recordedPrefix
            ? `Você já informou: “${recordedPrefix}”. Falta esclarecer qual passo de inspeção, fechamento ou verificação estava previsto, qual foi efetivamente executado ou omitido e como o resultado deveria ser confirmado.`
            : 'Quem executou a inspeção daquela portinhola e qual passo de inspeção, fechamento ou verificação estava previsto e foi efetivamente executado? Houve omissão de uma etapa, falta de confirmação da própria ação ou uma segunda checagem atribuída a outra pessoa?')
        : (recordedPrefix
            ? `You already provided: “${recordedPrefix}”. What remains to be established is which inspection, closing, or verification step was required, which step was actually performed or omitted, and how the result should have been confirmed.`
            : 'Who inspected that access panel, and what inspection, closing, or verification step was required and actually performed? Was a step omitted, was the actor own action left unverified, or was a second check assigned to someone else?')
      q.requestedEvidence = input.locale === 'pt-BR'
        ? ['procedimento de pré-voo aplicável', 'passo previsto versus passo efetivamente executado', 'evidência de confirmação do resultado ou segunda verificação']
        : ['applicable preflight procedure', 'required step versus step actually performed', 'evidence of result confirmation or second verification']
    }
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

  for (const [name, violated] of Object.entries(input.guardrails ?? {})) {
    if (violated) blockingReasons.push(`METHODOLOGICAL_GUARDRAIL_VIOLATION:${name}`)
  }

  const deduped = uniqueQuestions(questions)
  return {
    status: blockingReasons.length ? 'NEEDS_CLARIFICATION' : 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS',
    minimumEvidenceSatisfied: blockingReasons.length === 0,
    blockingReasons: [...new Set(blockingReasons)],
    questions: deduped,
  }
}
