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

const CATEGORY_DESCRIPTION_EN: Record<string, string> = {
  PHYSICAL_CAPABILITY: 'Physical or ergonomic condition potentially relevant to task execution.',
  SENSORY_LIMITATION: 'Sensory condition potentially relevant to situation perception.',
  KNOWLEDGE_TRAINING: 'Knowledge, training, qualification, or familiarity context supported by positive evidence.',
  TIME_PRESSURE: 'Time pressure or operational urgency that may have increased the likelihood of the active failure.',
  ATTENTION_WORKLOAD_CONTEXT: 'Attention capture, competing focus, or workload that may have increased the likelihood of the active failure.',
  COMMUNICATION_INFORMATION: 'Communication or information availability/quality condition relevant to the event.',
  PROCEDURAL_MONITORING: 'Monitoring or procedural-application condition that may have contributed to the active failure.',
  FEEDBACK_VERIFICATION: 'Condition related to feedback, cross-check, or verification of an action/information.',
  INTENT_AWARENESS: 'Awareness, intent, or relevant rule-knowledge context related to the actor objective.',
  TEAM_COORDINATION: 'Coordination condition among team members that may have influenced the event chain.',
  ENVIRONMENTAL_CONTEXT: 'Operational-environment condition that increased complexity or exposure without itself constituting the active failure.',
  TECHNICAL_CONTEXT: 'Technical system/equipment condition relevant to the causal context.',
  ORGANIZATIONAL_CONTEXT: 'Organizational, supervision, resource, or process condition potentially contributory.',
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
  locale: 'pt-BR' | 'en'
}): SeraPreconditionCandidate[] {
  if (input.escapePoint.status === 'INSUFFICIENT_EVIDENCE' || input.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') return []
  const categoryEvidence: Record<string, { texts: string[]; sourceEvidence: SeraEvidenceItem[]; investigationOnly: boolean }> = {}
  const contextualEvidence = input.factualExtraction.evidence.filter((item) => isEvidenceUsableFor(item, 'PRECONDITION'))
  const investigationIndicatedEvidence = input.factualExtraction.evidence.filter((item) =>
    item.sourceSection === 'REPORT_ANALYSIS' &&
    item.assertionStatus === 'AFFIRMED' &&
    item.supports.includes('PRECONDITION') &&
    /\b(supervis[aã]o|supervision|coordena[cç][aã]o|coordination|organizacional|organizational)\b/i.test(item.statement),
  )

  for (const item of contextualEvidence) {
    const category = classifyPreconditionCategory({ text: item.statement, proposedCode: null })
    if (!category) continue
    categoryEvidence[category] ||= { texts: [], sourceEvidence: [], investigationOnly: true }
    categoryEvidence[category].investigationOnly = false
    pushUnique(categoryEvidence[category].texts, item.statement)
    pushEvidence(categoryEvidence[category].sourceEvidence, item)
  }

  for (const item of investigationIndicatedEvidence) {
    const category = classifyPreconditionCategory({ text: item.statement, proposedCode: null })
    if (!category) continue
    categoryEvidence[category] ||= { texts: [], sourceEvidence: [], investigationOnly: true }
    pushUnique(categoryEvidence[category].texts, item.statement)
    pushEvidence(categoryEvidence[category].sourceEvidence, item)
  }

  return Object.entries(categoryEvidence).map(([category, evidenceSet]) => ({
    id: `PC-EVIDENCE-${category}`,
    label: category,
    description: evidenceSet.investigationOnly
      ? (input.locale === 'pt-BR'
          ? 'Fator indicado pela investigação, preservado como hipótese contextual e não confirmado como pré-condição causal.'
          : 'Factor indicated by the investigation, retained as a contextual hypothesis and not confirmed as a causal precondition.')
      : (input.locale === 'pt-BR'
          ? (CATEGORY_DESCRIPTION[category] ?? 'Pré-condição candidata sustentada por evidência factual e mantida separada do ponto de fuga e da falha ativa.')
          : (CATEGORY_DESCRIPTION_EN[category] ?? 'Candidate precondition supported by factual evidence and kept separate from the escape point and active failure.')),
    category: category as SeraPreconditionCandidate['category'],
    evidence: evidenceSet.texts,
    relationship: evidenceSet.investigationOnly ? 'UNRELATED_OR_UNSUPPORTED' : relationshipForEvidence(evidenceSet.sourceEvidence),
    sourceEvidence: evidenceSet.sourceEvidence,
    sourceRuleIds: [CATEGORY_RULE_ID[category]],
    linkedActor: input.directActor.actor,
    explicitlyNotEscapePoint: true,
    basedOnCandidateCode: false,
    nonFinal: true,
    confidence: evidenceSet.investigationOnly ? 'LOW' : confidenceFromCount(evidenceSet.texts.length),
  }))
}
