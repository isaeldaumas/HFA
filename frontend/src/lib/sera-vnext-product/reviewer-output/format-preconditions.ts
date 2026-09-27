import type { SeraPreconditionCandidate } from '@/lib/sera-vnext/engine-contract'
import type { SeraReviewerPreconditionCard, SeraReviewerOutput } from './types'
import { SERA_PRECONDITION_META, type SeraCanonicalPreconditionCategory } from '@/lib/sera-vnext/precondition-taxonomy'
import { summarizeEvidence, confidenceLabel } from './format-evidence'

const PRECONDITION_LABELS: Record<string, string> = {
  PHYSICAL_CAPABILITY: 'Capacidade física',
  SENSORY_LIMITATION: 'Limitação sensorial',
  KNOWLEDGE_TRAINING: 'Conhecimento e treinamento',
  TIME_PRESSURE: 'Pressão de tempo',
  ATTENTION_WORKLOAD_CONTEXT: 'Atenção e carga de trabalho',
  COMMUNICATION_INFORMATION: 'Comunicação e informação',
  PROCEDURAL_MONITORING: 'Monitoramento procedimental',
  FEEDBACK_VERIFICATION: 'Verificação de feedback',
  INTENT_AWARENESS: 'Consciência de intenção',
  TEAM_COORDINATION: 'Coordenação de equipe',
  ENVIRONMENTAL_CONTEXT: 'Contexto ambiental',
  TECHNICAL_CONTEXT: 'Contexto técnico',
  ORGANIZATIONAL_CONTEXT: 'Contexto organizacional',
}

function labelForCategory(category: string): string {
  return PRECONDITION_LABELS[category] ?? category
}

const CANONICAL_REVIEWER_QUESTIONS: Record<SeraCanonicalPreconditionCategory, string> = {
  PHYSIOLOGICAL: 'O estado fisiológico identificado estava presente e tornou a falha ativa mais provável?',
  PSYCHOLOGICAL: 'O estado, atitude ou viés psicológico identificado estava presente e tornou a falha ativa mais provável?',
  SOCIAL: 'A interação, liderança, autoridade, assertividade, coesão ou pressão social identificada contribuiu para a falha ativa?',
  PHYSICAL_CAPABILITY: 'A capacidade física do ator limitou a percepção ou a execução esperada no ponto de fuga?',
  PERSONAL_READINESS: 'A prontidão pessoal do ator estava degradada e contribuiu para a falha ativa?',
  TRAINING_SELECTION: 'Treinamento, seleção, conhecimento ou manutenção de proficiência contribuíram para a falha ativa?',
  QUALIFICATION_AUTHORIZATION: 'Havia deficiência de qualificação ou autorização relevante para a falha ativa?',
  TIME_PRESSURE: 'O tempo disponível era operacionalmente insuficiente ou muito restrito e contribuiu para a falha ativa?',
  OBJECTIVES: 'Os objetivos da tarefa eram pouco claros, inadequados, inconsistentes ou excessivamente arriscados e contribuíram para a falha ativa?',
  EQUIPMENT: 'A condição de equipamento, controle, display ou interface contribuiu para a falha ativa?',
  WORKSPACE: 'O arranjo físico do espaço de trabalho restringiu acesso, visão ou movimento e contribuiu para a falha ativa?',
  ENVIRONMENT: 'As condições ambientais identificadas estavam presentes e tornaram a falha ativa mais provável?',
  FORMING_INTENT: 'Houve falha na formação dos objetivos da tarefa ou na atribuição de responsabilidades que contribuiu para a falha ativa?',
  COMMUNICATING_INTENT: 'Houve falha em comunicar claramente a intenção ou os objetivos aos responsáveis pela execução?',
  MONITORING_SUPERVISION: 'O monitoramento ou a supervisão foram ausentes, tardios ou inadequados e contribuíram para a falha ativa?',
  MISSION: 'A missão era pouco clara, não aprovada ou incompatível com os recursos disponíveis e contribuiu para a falha ativa?',
  PROVISION_RESOURCES: 'A provisão de recursos humanos, materiais ou financeiros foi inadequada e contribuiu para a falha ativa?',
  RULES_REGULATIONS: 'As regras ou regulamentos eram inadequados como restrição ou salvaguarda para a operação segura?',
  ORGANIZATIONAL_PROCESS_PRACTICES: 'Processos ou práticas organizacionais contribuíram para tornar a falha ativa mais provável?',
  ORGANIZATIONAL_CLIMATE: 'O clima ou a cultura organizacional contribuiu para tornar a falha ativa mais provável?',
  OVERSIGHT: 'A vigilância organizacional, o gerenciamento de risco ou a correção de problemas sistêmicos foram inadequados e contribuíram para a falha ativa?',
}

function reviewerQuestion(category: string, canonicalCategory?: SeraCanonicalPreconditionCategory | null): string {
  if (canonicalCategory) return CANONICAL_REVIEWER_QUESTIONS[canonicalCategory]
  const map: Record<string, string> = {
    PHYSICAL_CAPABILITY: 'O ator tinha capacidade física para executar a ação esperada no ponto de fuga?',
    SENSORY_LIMITATION: 'A limitação sensorial descrita estava presente e era relevante no ponto de fuga?',
    KNOWLEDGE_TRAINING: 'A ausência de conhecimento ou treinamento contribuiu para a falha ou é apenas contexto?',
    TIME_PRESSURE: 'A pressão de tempo identificada era objetivamente adversa no ponto de fuga?',
    ATTENTION_WORKLOAD_CONTEXT: 'A captura de atenção, foco concorrente ou carga de trabalho aumentou a probabilidade da falha ativa sem substituir o mecanismo P/O/A?',
    COMMUNICATION_INFORMATION: 'A falha de comunicação ou informação identificada é sustentada por evidência explícita?',
    PROCEDURAL_MONITORING: 'O desvio procedimental ou de monitoramento identificado é um contribuinte ou apenas contexto?',
    FEEDBACK_VERIFICATION: 'A ausência de verificação ou feedback estava presente e foi um fator relevante no ponto de fuga?',
    INTENT_AWARENESS: 'Há evidência explícita de consciência ou intenção que altere a interpretação do eixo O?',
    TEAM_COORDINATION: 'A falha de coordenação de equipe é um contribuinte causal ou apenas um fator de contexto?',
    ENVIRONMENTAL_CONTEXT: 'As condições ambientais identificadas eram adversas e relevantes no ponto de fuga?',
    TECHNICAL_CONTEXT: 'O contexto técnico identificado explica ou apenas contextualiza a falha causal?',
    ORGANIZATIONAL_CONTEXT: 'As pressões organizacionais identificadas têm relação causal direta com o ponto de fuga?',
  }
  return map[category] ?? `Essa precondição (${category}) contribui causalmente para o ponto de fuga ou é apenas contexto?`
}

function formatRelationship(relationship: string): string {
  const map: Record<string, string> = {
    contributing_factor: 'Fator contribuinte — presente na cadeia causal candidata',
    context_only: 'Contexto apenas — não causal direto no ponto de fuga',
    enabling_condition: 'Condição habilitante — tornou possível ou provável a falha causal',
    precursor: 'Precursor — evento ou condição que antecedeu e precedeu a falha causal',
    unknown: 'Relação não determinada — requer revisão humana',
    CONTEXTUAL_PRECONDITION: 'Pré-condição contextual — aumentou a exposição/probabilidade, sem ser a falha ativa',
    ENABLING_PRECONDITION: 'Pré-condição habilitante — tornou a falha ativa mais provável ou possível',
    DIRECT_ESCAPE_POINT: 'Ligada diretamente ao ponto de fuga — revisar para evitar confusão com a falha ativa',
    POST_ESCAPE_CONSEQUENCE: 'Consequência posterior — não usar como causa inicial',
    UNRELATED_OR_UNSUPPORTED: 'Relação causal não sustentada — requer revisão',
  }
  return map[relationship] ?? relationship
}

export function buildPreconditionReview(preconditions: SeraPreconditionCandidate[]): SeraReviewerOutput['preconditionReview'] {
  if (!preconditions || preconditions.length === 0) {
    return {
      cards: [],
      absentOrInsufficient: ['Nenhuma precondição suficientemente sustentada pela evidência disponível.'],
      reviewerQuestions: ['Verifique se o relato contém evidência de fatores contribuintes que o motor não detectou.'],
    }
  }

  const cards: SeraReviewerPreconditionCard[] = preconditions.map((p): SeraReviewerPreconditionCard => ({
    category: p.category,
    plainLanguageLabel: p.canonicalCategory ? SERA_PRECONDITION_META[p.canonicalCategory].pt : labelForCategory(p.category),
    description: p.description,
    evidence: summarizeEvidence(p.evidence),
    relationship: formatRelationship(p.relationship as string),
    explicitlyNotEscapePoint: true,
    reviewerQuestion: reviewerQuestion(p.category, p.canonicalCategory),
    confidence: confidenceLabel(p.confidence),
  }))

  const reviewerQuestions = cards.map((card) => card.reviewerQuestion)

  return {
    cards,
    absentOrInsufficient: [],
    reviewerQuestions,
  }
}
