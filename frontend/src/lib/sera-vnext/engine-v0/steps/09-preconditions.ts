import type { SeraVNextEngineOutput, SeraPreconditionCandidate } from '../../engine-contract'
import type { SeraEvidenceItem, SeraEvidenceRelationshipToFailure } from '../../evidence'
import { isEvidenceUsableFor } from '../../evidence'
import { classifyPreconditionCategory, confidenceFromCount, pushUnique } from '../utils'

const CATEGORY_RULE_ID: Record<string, string> = {
  PHYSICAL_CAPABILITY: 'PC-RULE-PHYSICAL_CAPABILITY',
  SENSORY_LIMITATION: 'PC-RULE-SENSORY_LIMITATION',
  KNOWLEDGE_TRAINING: 'PC-RULE-KNOWLEDGE_TRAINING',
  TIME_PRESSURE: 'PC-RULE-TIME_PRESSURE',
  ATTENTION_WORKLOAD_CONTEXT: 'PC-RULE-ATTENTION_WORKLOAD_CONTEXT',
  COMMUNICATION_INFORMATION: 'PC-RULE-COMMUNICATION_INFORMATION',
  PROCEDURAL_MONITORING: 'PC-RULE-PROCEDURAL_MONITORING',
  FEEDBACK_VERIFICATION: 'PC-RULE-FEEDBACK_VERIFICATION',
  INTENT_AWARENESS: 'PC-RULE-INTENT_AWARENESS',
  TEAM_COORDINATION: 'PC-RULE-TEAM_COORDINATION',
  ENVIRONMENTAL_CONTEXT: 'PC-RULE-ENVIRONMENTAL_CONTEXT',
  TECHNICAL_CONTEXT: 'PC-RULE-TECHNICAL_CONTEXT',
  ORGANIZATIONAL_CONTEXT: 'PC-RULE-ORGANIZATIONAL_CONTEXT',
}


const CATEGORY_DESCRIPTION: Record<string, string> = {
  PHYSICAL_CAPABILITY: 'Condição física ou ergonômica potencialmente relevante para a execução da tarefa.',
  SENSORY_LIMITATION: 'Condição sensorial potencialmente relevante para a percepção da situação.',
  KNOWLEDGE_TRAINING: 'Contexto de conhecimento, treinamento, qualificação ou familiaridade sustentado por evidência positiva.',
  TIME_PRESSURE: 'Pressão de tempo ou urgência operacional que pode ter aumentado a probabilidade da falha ativa.',
  ATTENTION_WORKLOAD_CONTEXT: 'Captura de atenção, foco concorrente ou carga de trabalho que pode ter aumentado a probabilidade da falha ativa.',
  COMMUNICATION_INFORMATION: 'Condição de comunicação ou disponibilidade/qualidade da informação relevante ao evento.',
  PROCEDURAL_MONITORING: 'Condição de monitoramento ou aplicação procedimental que pode ter favorecido a falha ativa.',
  FEEDBACK_VERIFICATION: 'Condição relacionada a feedback, cross-check ou verificação de uma ação/informação.',
  INTENT_AWARENESS: 'Contexto de consciência, intenção ou conhecimento de regra relevante ao objetivo do ator.',
  TEAM_COORDINATION: 'Condição de coordenação entre membros da equipe que pode ter influenciado a cadeia do evento.',
  ENVIRONMENTAL_CONTEXT: 'Condição do ambiente operacional que aumentou a complexidade ou exposição, sem constituir por si só a falha ativa.',
  TECHNICAL_CONTEXT: 'Condição técnica do sistema/equipamento relevante ao contexto causal.',
  ORGANIZATIONAL_CONTEXT: 'Condição organizacional, de supervisão, recursos ou processo potencialmente contributiva.',
}

function relationshipForEvidence(items: SeraEvidenceItem[]): SeraEvidenceRelationshipToFailure {
  if (items.some((item) => item.relationshipToFailure === 'CONTEXTUAL_PRECONDITION')) return 'CONTEXTUAL_PRECONDITION'
  if (items.some((item) => item.relationshipToFailure === 'ENABLING_PRECONDITION')) return 'ENABLING_PRECONDITION'
  if (items.some((item) => item.relationshipToFailure === 'DIRECT_ESCAPE_POINT')) return 'ENABLING_PRECONDITION'
  return 'UNRELATED_OR_UNSUPPORTED'
}

function pushEvidence(target: SeraEvidenceItem[], item: SeraEvidenceItem): void {
  if (!target.some((candidate) => candidate.evidenceId === item.evidenceId)) target.push(item)
}

export function runStep09Preconditions(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  axes: SeraVNextEngineOutput['axes']
}): SeraPreconditionCandidate[] {
  if (input.escapePoint.status === 'INSUFFICIENT_EVIDENCE' || input.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') return []
  const categoryEvidence: Record<string, { texts: string[]; sourceEvidence: SeraEvidenceItem[] }> = {}
  const contextualEvidence = input.factualExtraction.evidence.filter((item) => isEvidenceUsableFor(item, 'PRECONDITION'))

  for (const item of contextualEvidence) {
    const category = classifyPreconditionCategory({ text: item.statement, proposedCode: null })
    if (!category) continue
    categoryEvidence[category] ||= { texts: [], sourceEvidence: [] }
    pushUnique(categoryEvidence[category].texts, item.statement)
    pushEvidence(categoryEvidence[category].sourceEvidence, item)
  }

  return Object.entries(categoryEvidence).map(([category, evidenceSet]) => ({
    id: `PC-EVIDENCE-${category}`,
    label: category,
    description: CATEGORY_DESCRIPTION[category] ?? 'Pré-condição candidata sustentada por evidência factual e mantida separada do ponto de fuga e da falha ativa.',
    category: category as SeraPreconditionCandidate['category'],
    evidence: evidenceSet.texts,
    relationship: relationshipForEvidence(evidenceSet.sourceEvidence),
    sourceEvidence: evidenceSet.sourceEvidence,
    sourceRuleIds: [CATEGORY_RULE_ID[category]],
    linkedActor: input.directActor.actor,
    explicitlyNotEscapePoint: true,
    basedOnCandidateCode: false,
    nonFinal: true,
    confidence: confidenceFromCount(evidenceSet.texts.length),
  }))
}
