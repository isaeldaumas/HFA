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
  O_ROUTINE_VIOLATION: 'Padrão de violação',
  A_ROOT: 'Estratégia de ação',
  A_IMPLEMENTED: 'Execução da ação',
  A_CORRECT: 'Adequação da ação',
  A_CAPABILITY: 'Capacidade de executar',
  A_SELECTION: 'Seleção da resposta',
  A_FEEDBACK: 'Feedback e verificação',
}

export function friendlyNodeLabel(nodeId: string, pt = true): string {
  if (!pt) return nodeId.replaceAll('_', ' ').toLowerCase()
  return NODE_LABELS_PT[nodeId] ?? nodeId.replaceAll('_', ' ').toLowerCase()
}
export type CandidateAttention = {
  score: number
  level: 'low' | 'attention' | 'elevated' | 'high'
  labelPt: string
  labelEn: string
  activeAxes: string[]
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
  const actor = args.output.directActor.actor ?? (pt ? 'ator não resolvido' : 'unresolved actor')
  const sentence = (value: string) => value.trim().replace(/[.\s]+$/, '')
  const escape = sentence(args.output.escapePoint.statement ?? (pt ? 'ponto de fuga não estabelecido' : 'escape point not established'))
  const codes = [
    args.output.axes.perception.proposedCode,
    args.output.axes.objective.proposedCode,
    args.output.axes.action.proposedCode,
  ].map((value) => value ?? '—').join(' / ')
  const safeState = args.output.safeOperationModel.expectedSafeState ? sentence(args.output.safeOperationModel.expectedSafeState) : null
  if (pt) {
    const subject = args.title?.trim() ? `No evento ${args.title.trim()}, ` : 'No evento analisado, '
    const safe = safeState ? `O estado seguro esperado era: ${safeState}. ` : ''
    return `${subject}o ponto de fuga foi identificado quando ${escape.replace(/^Quando\s+/i, '')}. ` +
      `O ator direto candidato é ${actor}. ${safe}A classificação candidata é ${codes}.`
  }
  const subject = args.title?.trim() ? `In event ${args.title.trim()}, ` : 'In the analyzed event, '
  const safe = safeState ? `The expected safe state was: ${safeState}. ` : ''
  return `${subject}the escape point was identified when ${escape.replace(/^When\s+/i, '')}. ` +
    `The candidate direct actor is ${actor}. ${safe}The candidate classification is ${codes}.`
}
export function friendlyAnswerLabel(value: string, pt = true): string {
  const yes = new Set(['SIM', 'SIM_ATENCAO', 'SIM_GERENCIAMENTO', 'SIM_SELECAO', 'SIM_FEEDBACK'])
  if (value === 'START') return pt ? 'Início' : 'Start'
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
    'O_MANAGED_RISK:SIM': 'O objetivo, embora compatível com regras gerais, não gerenciava adequadamente o risco operacional.',
    'A_ROOT:START': 'Primeiro se identifica como o operador tentou executar o objetivo no ponto de fuga.',
    'A_IMPLEMENTED:SIM': 'A ação foi executada de forma coerente com o estado percebido; o fluxo verifica se existia outra falha independente de ação.',
    'A_IMPLEMENTED:NÃO_DESLIZE_LAPSO_ERRO': 'Há evidência de deslize, lapso ou erro específico na implementação da ação.',
    'A_IMPLEMENTED:NÃO_FEEDBACK': 'Há evidência de falha de feedback ou verificação da própria execução.',
    'A_CORRECT:SIM': 'Não foi demonstrado mecanismo independente de ação inadequada; a ação era coerente com a percepção e o objetivo do ator, conduzindo a A-A.',
    'A_CORRECT:NÃO': 'A ação implementada era inadequada por mecanismo próprio; o fluxo segue para capacidade e seleção da resposta.',
  }
  return map[key] ?? fallback
}
