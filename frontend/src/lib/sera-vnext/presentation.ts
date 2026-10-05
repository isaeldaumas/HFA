import type { SeraVNextEngineOutput } from './engine-contract'

const NODE_LABELS_PT: Record<string, string> = {
  P_ROOT: 'Estado percebido',
  P_ASSESSMENT: 'Avaliação da situação',
  P_CAPABILITY: 'Capacidade de perceber',
  P_TIME_PRESSURE: 'Pressão de tempo',
  P_INFORMATION_AMBIGUOUS: 'Clareza da informação',
  P_INFORMATION_AVAILABLE: 'Disponibilidade da informação',
  O_ROOT: 'Objetivo pretendido',
  O_RULES: 'Compatibilidade com regras e procedimentos',
  O_MANAGED_RISK: 'Gerenciamento do risco',
  O_ROUTINE: 'Padrão de violação',
  A_ROOT: 'Estratégia de ação',
  A_IMPLEMENTED: 'Execução da ação',
  A_CORRECT: 'Adequação da ação',
  A_CAPABILITY: 'Capacidade de executar',
  A_TIME_PRESSURE: 'Pressão de tempo na ação',
}

const NODE_LABELS_EN: Record<string, string> = {
  P_ROOT: 'Perceived state',
  P_ASSESSMENT: 'Situation assessment',
  P_CAPABILITY: 'Capability to perceive',
  P_TIME_PRESSURE: 'Time pressure',
  P_INFORMATION_AMBIGUOUS: 'Information clarity',
  P_INFORMATION_AVAILABLE: 'Information availability',
  O_ROOT: 'Intended objective',
  O_RULES: 'Rules and procedures',
  O_MANAGED_RISK: 'Risk management',
  O_ROUTINE: 'Violation pattern',
  A_ROOT: 'Action strategy',
  A_IMPLEMENTED: 'Action execution',
  A_CORRECT: 'Action adequacy',
  A_CAPABILITY: 'Capability to act',
  A_TIME_PRESSURE: 'Time pressure on action',
}

export function friendlyNodeLabel(nodeId: string, pt = true): string {
  const labels = pt ? NODE_LABELS_PT : NODE_LABELS_EN
  return labels[nodeId] ?? nodeId.replaceAll('_', ' ').toLowerCase()
}

export function directActorStatusLabel(
  directActor: SeraVNextEngineOutput['directActor'],
  pt = true,
): string {
  if (directActor.status === 'IDENTIFIED') return pt ? 'Identificado' : 'Identified'
  if (directActor.status === 'NOT_APPLICABLE') return pt ? 'Não aplicável' : 'Not applicable'
  if (!directActor.actor && directActor.alternatives.length === 0) return pt ? 'Não resolvido' : 'Unresolved'
  return pt ? 'Ambíguo — requer decomposição' : 'Ambiguous — requires decomposition'
}

export function preconditionMethodologyMatchLabel(value: string, pt = true, basedOnCandidateCode = false): string {
  const labels: Record<string, [string, string]> = {
    MOST_LIKELY_AND_EVIDENCED: ['Prevista na tabela e sustentada pela evidência', 'Listed as most likely and supported by evidence'],
    EVIDENCED_OUTSIDE_MOST_LIKELY_SET: ['Sustentada pela evidência fora do conjunto mais provável da tabela', 'Supported by evidence outside the table most-likely set'],
    HYPOTHESIS_ONLY: basedOnCandidateCode
      ? ['Hipótese da tabela sem confirmação causal', 'Table hypothesis without causal confirmation']
      : ['Hipótese contextual sem confirmação causal', 'Contextual hypothesis without causal confirmation'],
  }
  const label = labels[value]
  return label ? label[pt ? 0 : 1] : value
}

export function preconditionLevelLabel(value: string, pt = true): string {
  const labels: Record<string, [string, string]> = {
    IMMEDIATE: ['Imediato', 'Immediate'],
    COMMAND_CONTROL_SUPERVISION: ['Comando, controle e supervisão', 'Command, control and supervision'],
    ORGANIZATIONAL: ['Organizacional', 'Organizational'],
  }
  const label = labels[value]
  return label ? label[pt ? 0 : 1] : value
}

export function hfacsBridgeLevelLabel(value: string, pt = true): string {
  const labels: Record<string, [string, string]> = {
    ACTIVE_FAILURE: ['Falha ativa', 'Active failure'],
    PRECONDITION: ['Pré-condição', 'Precondition'],
    SUPERVISION: ['Supervisão', 'Supervision'],
    ORGANIZATION: ['Organização', 'Organization'],
  }
  const label = labels[value]
  return label ? label[pt ? 0 : 1] : value
}

export type CandidateAttention = {
  score: number
  level: 'low' | 'attention' | 'elevated' | 'high'
  labelPt: string
  labelEn: string
  activeAxes: string[]
}

export type SeraBlockingDiagnostic = {
  kind: 'CONFLICTING_SOURCES' | 'INCOMPLETE_RECORD' | 'UNKNOWN_MECHANISM' | 'GENERIC'
  reason: string
  evidence: string[]
  evidenceHeading: string
  reviewerQuestion: string
  impact: string
}

function diagnosticSentences(narrative: string): string[] {
  return narrative
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function isMissingReference(value: string | null | undefined): boolean {
  if (!value?.trim()) return true
  return /\b(n[aã]o especifica(?:d[oa])?|n[aã]o estabelece|n[aã]o [ée] poss[ií]vel determinar|n[aã]o foi poss[ií]vel determinar|n[aã]o informado|not specified|does not establish|cannot determine|could not determine|not available)\b/i.test(value)
}

export function buildBlockingDiagnostic(args: {
  narrative: string
  output: SeraVNextEngineOutput
  pt?: boolean
}): SeraBlockingDiagnostic | null {
  const pt = args.pt !== false
  if (args.output.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') return null
  if (args.output.canonicalTraversal.paths.length > 0) return null

  const sentences = diagnosticSentences(args.narrative)
  const conflictPattern = /\b(conflit\w*|contradit\w*|diverg\w*|incompat[ií]v\w*|inconsisten\w*|fontes?\s+(?:diferentes?|distintas?).{0,80}(?:indicam|registram|descrevem)|registros?\s+(?:diferentes?|distintos?).{0,80}(?:indicam|registram|descrevem)|conflicting|contradict\w*|diverg\w*|inconsistent|incompatible)\b/i
  const sourceContrastPattern = /\b(fonte|registro|relat[oó]rio|documento|source|record|report)\b.{0,140}\b(enquanto|por[eé]m|mas|whereas|while|but)\b.{0,140}\b(fonte|registro|relat[oó]rio|documento|source|record|report)\b/i
  const conflictResolutionPattern = /\b(?:as\s+)?(?:duas|2)\s+vers[oõ]es?|vers[oõ]es?\s+(?:diferentes?|incompat[ií]veis|divergentes?)|discrep[aâ]ncia|diverg[eê]ncia|n[aã]o h[aá] evid[eê]ncia independente suficiente para escolher|n[aã]o (?:permite|foi poss[ií]vel) determinar qual|qual (?:fonte|registro|vers[aã]o)|different versions?|which (?:source|record|version)|discrepancy\b/i
  const sourceVersionPattern = /\b(entrevista|declarou|afirmou|relatou|depoimento|vers[oã]o|vers[oõ]es|fonte|registro|fdr|cvr|radar|telemetria|interview|stated|reported|version|source|record)\b/i
  const incompletePattern = /\b(registro incompleto|registros? incompletos?|registro dispon[ií]vel informa apenas|n[aã]o foram coletados depoimentos|relat[oó]rio n[aã]o descreve|sem registro|n[aã]o h[aá] registro|n[aã]o foi registrado|dados? indispon[ií]ve\w*|informa[cç][aã]o incompleta|informa[cç][aã]o ausente|n[aã]o informado|missing record|incomplete record|no record|data unavailable|information unavailable)\b/i
  const unknownMechanismPattern = /\b(mecanismo desconhecido|mecanismo n[aã]o (?:foi )?determinado|causa n[aã]o (?:foi )?determinada|n[aã]o (?:foi|[ée]) poss[ií]vel determinar|n[aã]o se sabe (?:como|por que|qual)|origem (?:foi|era) humana, t[eé]cnica ou ambiental|descreve apenas o resultado|unknown mechanism|mechanism (?:was )?not determined|could not determine|cannot determine|describes only the outcome)\b/i

  const explicitConflictEvidence = sentences.filter((item) => conflictPattern.test(item) || sourceContrastPattern.test(item)).slice(0, 3)
  const conflictIsExplicit = conflictResolutionPattern.test(args.narrative)
  const sourceVersionEvidence = sentences.filter((item) => sourceVersionPattern.test(item)).slice(0, 4)
  const conflictEvidence = explicitConflictEvidence.length
    ? [...new Set([...sourceVersionEvidence, ...explicitConflictEvidence])].slice(0, 3)
    : conflictIsExplicit
      ? sourceVersionEvidence.slice(0, 3)
      : []
  const incompleteEvidence = sentences.filter((item) => incompletePattern.test(item)).slice(0, 3)
  const explicitIncompleteRecord = /registro(?:s)?.{0,24}incomplet|incomplete record/i.test(args.narrative)
  const incompleteSignalCount = [
    /registro dispon[ií]vel informa apenas/i,
    /n[aã]o foram coletados depoimentos/i,
    /relat[oó]rio n[aã]o descreve/i,
    /registro(?:s)?.{0,24}incomplet/i,
    /informa[cç][aã]o (?:incompleta|ausente)/i,
  ].filter((pattern) => pattern.test(args.narrative)).length
  const unknownEvidence = sentences.filter((item) => unknownMechanismPattern.test(item)).slice(0, 3)
  const safeReferenceMissing = isMissingReference(args.output.safeOperationModel.expectedSafeState)
    && isMissingReference(args.output.safeOperationModel.expectedSafeAction)

  const internalDiagnosticPattern = /\b(independent semantic human-factor gate|human safe.?unsafe departure|hendy gate|operator-controlled unsafe condition)\b/i
  const fallbackEvidence = [
    ...args.output.escapePoint.counterEvidence,
    ...args.output.evidenceSufficiency.questions.flatMap((question) => question.requestedEvidence.map((item) => `${question.whyNeeded} — ${item}`)),
  ].filter((item, index, all) => item && !internalDiagnosticPattern.test(item) && all.indexOf(item) === index).slice(0, 3)

  if (conflictEvidence.length) {
    return {
      kind: 'CONFLICTING_SOURCES',
      reason: pt
        ? 'Fontes ou registros descrevem de forma incompatível o primeiro desvio. O motor não pode escolher silenciosamente uma versão para criar o ponto de fuga.'
        : 'Sources or records describe the first departure incompatibly. The engine must not silently choose one version to create the escape point.',
      evidence: conflictEvidence,
      evidenceHeading: pt ? 'Evidências divergentes' : 'Divergent evidence',
      reviewerQuestion: pt
        ? 'Quais fontes descrevem o primeiro desvio de forma incompatível, qual deve prevalecer e existe evidência independente capaz de resolver a divergência?'
        : 'Which sources describe the first departure incompatibly, which should prevail, and is there independent evidence that resolves the discrepancy?',
      impact: pt
        ? 'Sem resolver o conflito, o ponto de fuga e o ator direto não podem ser definidos; P/O/A permanecem bloqueados.'
        : 'Until the conflict is resolved, the escape point and direct actor cannot be established; P/O/A remains blocked.',
    }
  }

  if (explicitIncompleteRecord || incompleteSignalCount >= 2 || incompleteEvidence.length >= 2 || (safeReferenceMissing && incompleteEvidence.length > 0)) {
    return {
      kind: 'INCOMPLETE_RECORD',
      reason: pt
        ? 'O registro disponível não estabelece, com evidência suficiente, a referência segura e/ou a primeira saída observável da operação segura.'
        : 'The available record does not establish, with sufficient evidence, the safe reference and/or the first observable departure from safe operation.',
      evidence: incompleteEvidence.length ? incompleteEvidence : fallbackEvidence,
      evidenceHeading: pt ? 'Lacunas do registro' : 'Record gaps',
      reviewerQuestion: pt
        ? 'Qual registro contemporâneo estabelece o estado ou a ação segura esperada e qual foi a primeira ação, decisão ou omissão humana observável que iniciou o desvio?'
        : 'What contemporaneous record establishes the expected safe state/action, and what was the first observable human action, decision, or omission that initiated the departure?',
      impact: pt
        ? 'Sem essa sequência mínima, qualquer ponto de fuga ou ator seria inferido; a classificação P/O/A deve permanecer fechada.'
        : 'Without this minimum sequence, any escape point or actor would be inferred; P/O/A classification must remain closed.',
    }
  }

  if (unknownEvidence.length || args.output.escapePoint.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      kind: 'UNKNOWN_MECHANISM',
      reason: pt
        ? 'Há um estado ou resultado operacional observado, mas o mecanismo humano que o antecedeu não está demonstrado pela evidência disponível.'
        : 'An operational state or outcome is observed, but the preceding human mechanism is not demonstrated by the available evidence.',
      evidence: unknownEvidence.length ? unknownEvidence : fallbackEvidence,
      evidenceHeading: pt ? 'Evidência que permanece ausente' : 'Evidence still missing',
      reviewerQuestion: pt
        ? 'Existe evidência anterior ao resultado que demonstre qual ação, decisão, omissão ou percepção humana iniciou o desvio? Se não houver, confirme que o mecanismo permanece indeterminado.'
        : 'Is there pre-outcome evidence showing which human action, decision, omission, or perception initiated the departure? If not, confirm that the mechanism remains undetermined.',
      impact: pt
        ? 'Resultado observado não substitui mecanismo causal. Sem esse vínculo, ponto de fuga, ator e P/O/A não podem ser preenchidos.'
        : 'An observed outcome does not substitute for a causal mechanism. Without that link, the escape point, actor, and P/O/A cannot be populated.',
    }
  }

  return {
    kind: 'GENERIC',
    reason: pt ? 'A evidência disponível não sustenta uma âncora P/O/A sem inferência.' : 'Available evidence does not support a P/O/A anchor without inference.',
    evidence: fallbackEvidence,
    evidenceHeading: pt ? 'Evidência necessária' : 'Evidence needed',
    reviewerQuestion: pt ? 'Qual evidência adicional resolve a primeira saída da operação segura e o ator diretamente envolvido?' : 'What additional evidence resolves the first departure from safe operation and the directly involved actor?',
    impact: pt ? 'Enquanto a lacuna persistir, P/O/A permanecem bloqueados.' : 'While the gap remains, P/O/A remains blocked.',
  }
}

export function computeCandidateAttention(
  p: string | null | undefined,
  o: string | null | undefined,
  a: string | null | undefined,
): CandidateAttention | null {
  if (!p && !o && !a) return null
  const activeAxes: string[] = []
  let weighted = 0
  let availableWeight = 0
  if (p) { availableWeight += 1.0; if (p !== 'P-A') { weighted += 1.0; activeAxes.push('P') } }
  if (o) { availableWeight += 0.8; if (o !== 'O-A') { weighted += 0.8; activeAxes.push('O') } }
  if (a) { availableWeight += 0.6; if (a !== 'A-A') { weighted += 0.6; activeAxes.push('A') } }
  if (availableWeight === 0) return null
  const score = Math.round((weighted / availableWeight) * 100)
  if (score >= 75) return { score, level: 'high', labelPt: 'Prioridade alta', labelEn: 'High priority', activeAxes }
  if (score >= 50) return { score, level: 'elevated', labelPt: 'Prioridade elevada', labelEn: 'Elevated priority', activeAxes }
  if (score >= 25) return { score, level: 'attention', labelPt: 'Requer atenção', labelEn: 'Needs attention', activeAxes }
  return { score, level: 'low', labelPt: 'Baixa prioridade', labelEn: 'Low priority', activeAxes }
}
export function buildExecutiveSummary(args: {
  title?: string | null
  occurredAt?: string | null
  output: SeraVNextEngineOutput
  pt?: boolean
}): string {
  const pt = args.pt !== false
  const sentence = (value: string) => value.trim().replace(/[.\s]+$/, '')
  const firstDeparture = sentence(args.output.escapePoint.firstDepartureCandidate ?? args.output.escapePoint.statement ?? (pt ? 'primeira saída não estabelecida' : 'first departure not established'))
  const rawLaterCritical = args.output.escapePoint.criticalUnsafeActCandidate
  const sameLandmark = rawLaterCritical
    ? sentence(rawLaterCritical).localeCompare(firstDeparture, undefined, { sensitivity: 'base' }) === 0
    : false
  const laterCriticalAct = sentence(!sameLandmark && rawLaterCritical
    ? rawLaterCritical
    : (pt ? 'nenhum ato crítico posterior distinto estabelecido' : 'no distinct later critical act established'))
  const laterCriticalActor = !sameLandmark && rawLaterCritical
    ? args.output.escapePoint.criticalUnsafeActActor ?? (pt ? 'não atribuído / não aplicável' : 'not attributed / not applicable')
    : (pt ? 'não aplicável' : 'not applicable')
  const escapeActor = args.output.escapePoint.firstDepartureActor ?? args.output.directActor.actor ?? (pt ? 'não individualizado' : 'not individually resolved')
  const codes = [
    args.output.axes.perception.proposedCode,
    args.output.axes.objective.proposedCode,
    args.output.axes.action.proposedCode,
  ].map((value) => value ?? '—').join(' / ')
  const safeState = args.output.safeOperationModel.expectedSafeState ? sentence(args.output.safeOperationModel.expectedSafeState) : null
  if (args.output.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') {
    const subject = args.title?.trim()
      ? (pt ? `No evento ${args.title.trim()}, ` : `In event ${args.title.trim()}, `)
      : (pt ? 'No evento analisado, ' : 'In the analyzed event, ')
    const safe = safeState
      ? (pt ? `o estado seguro esperado era: ${safeState}. ` : `the expected safe state was: ${safeState}. `)
      : ''
    return pt
      ? `${subject}${safe}não foi estabelecida nenhuma ação, decisão, omissão ou percepção humana como primeira saída da operação segura. O gate de fatores humanos permanece fechado: não há ponto de fuga humano nem ator P/O/A aplicável, e a travessia P/O/A não é iniciada. O caso permanece sujeito à confirmação humana dessa não aplicabilidade.`
      : `${subject}${safe}no human action, decision, omission, or perception was established as the first departure from safe operation. The human-factors gate remains closed: there is no applicable human escape point or P/O/A actor, and P/O/A traversal is not started. Human confirmation of this non-applicability is still required.`
  }
  const ready = args.output.evidenceSufficiency.status === 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS'
    && args.output.directActor.status === 'IDENTIFIED'
    && args.output.escapePoint.confidence !== 'LOW'
    && !Object.values(args.output.guardrails).some(Boolean)
  if (pt) {
    const subject = args.title?.trim() ? `No evento ${args.title.trim()}, ` : 'No evento analisado, '
    const safe = safeState ? `O estado seguro esperado era: ${safeState}. ` : ''
    const landmarks = `Ponto de fuga SERA / primeira saída da operação segura: ${firstDeparture} (ator: ${escapeActor}); esta é a única âncora P/O/A. Evolução crítica posterior, quando distinta: ${laterCriticalAct} (ator: ${laterCriticalActor}). `
    if (!ready) return `${subject}a análise permanece não resolvida para fechamento metodológico. ${safe}${landmarks}P/O/A: ${codes}. As razões de bloqueio devem ser resolvidas antes do uso formal.`
    return `${subject}${safe}${landmarks}A classificação candidata é ${codes}.`
  }
  const subject = args.title?.trim() ? `In event ${args.title.trim()}, ` : 'In the analyzed event, '
  const safe = safeState ? `The expected safe state was: ${safeState}. ` : ''
  const landmarks = `SERA escape point / first departure from safe operation: ${firstDeparture} (actor: ${escapeActor}); this is the sole P/O/A anchor. Later critical evolution, when distinct: ${laterCriticalAct} (actor: ${laterCriticalActor}). `
  if (!ready) return `${subject}the analysis remains unresolved for methodological closure. ${safe}${landmarks}P/O/A: ${codes}. Blocking reasons must be resolved before formal use.`
  return `${subject}${safe}${landmarks}The candidate classification is ${codes}.`
}

export function friendlyAnswerLabel(value: string, pt = true): string {
  const yes = new Set(['SIM', 'SIM_ATENCAO', 'SIM_GERENCIAMENTO', 'SIM_SELECAO', 'SIM_FEEDBACK'])
  if (value === 'START') return pt ? 'Resposta descritiva' : 'Descriptive response'
  if (yes.has(value)) return pt ? 'Sim' : 'Yes'
  if (value.startsWith('NÃO')) return pt ? 'Não' : 'No'
  if (value === 'INSUFFICIENT_EVIDENCE') return pt ? 'Evidência insuficiente' : 'Insufficient evidence'
  return value
}

export function didacticNodeReason(nodeId: string, answer: string, fallback: string, pt = true): string {
  if (!pt) return fallback
  const key = `${nodeId}:${answer}`
  const map: Record<string, string> = {
    'P_ROOT:START': 'Primeiro se estabelece o que o operador acreditava estar acontecendo no ponto de fuga.',
    'P_ASSESSMENT:NÃO': 'A avaliação da situação não correspondia ao estado real; por isso o fluxo procura qual mecanismo perceptivo explica essa divergência.',
    'P_ASSESSMENT:SIM': 'A avaliação da situação foi adequada; não há falha perceptiva independente neste eixo.',
    'P_CAPABILITY:SIM': 'Havia capacidade e meios para perceber a situação; o fluxo segue para pressão de tempo e qualidade da informação.',
    'P_CAPABILITY:NÃO_SENSORIAL': 'A evidência localiza a falha em uma limitação sensorial ou perceptiva.',
    'P_CAPABILITY:NÃO_CONHECIMENTO': 'A evidência localiza a falha em conhecimento ou familiaridade necessários para interpretar o estímulo.',
    'P_TIME_PRESSURE:NÃO': 'Não há evidência de pressão de tempo excessiva dominante; o fluxo segue para verificar a qualidade e disponibilidade da informação.',
    'P_INFORMATION_AMBIGUOUS:NÃO': 'A informação relevante não era ilusória ou ambígua; resta verificar se ela estava disponível e correta.',
    'P_INFORMATION_AMBIGUOUS:SIM': 'A informação disponível era ambígua ou ilusória e podia induzir uma percepção incorreta.',
    'P_INFORMATION_AVAILABLE:SIM': 'A informação necessária estava disponível e correta, mas a avaliação permaneceu inadequada; isso conduz ao candidato P-G.',
    'P_INFORMATION_AVAILABLE:NÃO': 'A informação necessária não estava disponível ou não estava correta; o fluxo segue para o ramo de comunicação/informação.',
    'O_ROOT:START': 'Primeiro se identifica o objetivo que o operador pretendia alcançar no ponto de fuga.',
    'O_RULES:SIM': 'O objetivo era compatível com regras e procedimentos; o fluxo verifica se ainda havia um problema independente de gerenciamento do risco.',
    'O_RULES:NÃO': 'Há evidência de objetivo incompatível com regras ou procedimentos; o fluxo passa a distinguir o tipo de violação.',
    'O_MANAGED_RISK:NÃO': 'Não foi demonstrado um objetivo inseguro independente; mantém-se O-A, sem falha de objetivo.',
    'O_MANAGED_RISK:SIM': 'Há evidência positiva de um objetivo de eficiência, economia, tempo, produtividade ou equivalente; isso sustenta o ramo O-D.',
    'A_ROOT:START': 'Primeiro se identifica como o operador tentou executar o objetivo no ponto de fuga.',
    'A_IMPLEMENTED:SIM': 'A ação foi executada de forma coerente com o estado percebido; o fluxo verifica se existia outra falha independente de ação.',
    'A_IMPLEMENTED:NÃO_DESLIZE_LAPSO_ERRO': 'Há evidência de deslize, lapso ou erro específico na implementação da ação.',
    'A_IMPLEMENTED:NÃO_FEEDBACK': 'Há evidência de falha de feedback ou verificação da própria execução.',
    'A_IMPLEMENTED:INSUFFICIENT_EVIDENCE': 'A evidência disponível não resolve de forma consistente se a execução correspondeu à intenção; a travessia permanece interrompida até o mecanismo ser esclarecido.',
    'A_CORRECT:SIM': 'Não foi demonstrado mecanismo independente de ação inadequada; a ação era coerente com a percepção e o objetivo do ator, conduzindo a A-A.',
    'A_CORRECT:NÃO': 'A ação implementada era inadequada por mecanismo próprio; o fluxo segue para capacidade e seleção da resposta.',
    'A_CAPABILITY:INSUFFICIENT_EVIDENCE': 'A evidência disponível não demonstra positivamente capacidade, conhecimento ou habilidade suficientes para continuar a discriminação do subtipo de ação.',
  }
  return map[key] ?? fallback
}
