export type SeraCanonicalPreconditionCategory =
  | 'PHYSIOLOGICAL' | 'PSYCHOLOGICAL' | 'SOCIAL' | 'PHYSICAL_CAPABILITY'
  | 'PERSONAL_READINESS' | 'TRAINING_SELECTION' | 'QUALIFICATION_AUTHORIZATION'
  | 'TIME_PRESSURE' | 'OBJECTIVES' | 'EQUIPMENT' | 'WORKSPACE' | 'ENVIRONMENT'
  | 'FORMING_INTENT' | 'COMMUNICATING_INTENT' | 'MONITORING_SUPERVISION'
  | 'MISSION' | 'PROVISION_RESOURCES' | 'RULES_REGULATIONS'
  | 'ORGANIZATIONAL_PROCESS_PRACTICES' | 'ORGANIZATIONAL_CLIMATE' | 'OVERSIGHT'

export type SeraPreconditionLevel = 'IMMEDIATE' | 'COMMAND_CONTROL_SUPERVISION' | 'ORGANIZATIONAL'

export const SERA_PRECONDITION_META: Record<SeraCanonicalPreconditionCategory, { level: SeraPreconditionLevel; pt: string; en: string; definitionPt: string; definitionEn: string }> = {
  PHYSIOLOGICAL: { level: 'IMMEDIATE', pt: 'Fisiológico', en: 'Physiological', definitionPt: 'Estado fisiológico do indivíduo que pode afetar o desempenho.', definitionEn: 'Physiological state of the individual that may affect performance.' },
  PSYCHOLOGICAL: { level: 'IMMEDIATE', pt: 'Psicológico', en: 'Psychological', definitionPt: 'Estados, atitudes, traços e vieses de processamento que podem afetar percepção, decisão ou ação.', definitionEn: 'States, attitudes, traits, and processing biases that may affect perception, decision, or action.' },
  SOCIAL: { level: 'IMMEDIATE', pt: 'Social', en: 'Social', definitionPt: 'Fatores de interação, liderança, autoridade, assertividade, coesão e pressão social.', definitionEn: 'Interaction, leadership, authority, assertiveness, cohesion, and social-pressure factors.' },
  PHYSICAL_CAPABILITY: { level: 'IMMEDIATE', pt: 'Capacidade física', en: 'Physical capability', definitionPt: 'Capacidade física não cognitiva para sentir informação e implementar a resposta pretendida.', definitionEn: 'Non-cognitive physical capability to sense information and implement the intended response.' },
  PERSONAL_READINESS: { level: 'IMMEDIATE', pt: 'Prontidão pessoal', en: 'Personal readiness', definitionPt: 'Estado de preparação fisiológica, psicológica, física e mental para executar a tarefa.', definitionEn: 'Physiological, psychological, physical, and mental readiness to perform the task.' },
  TRAINING_SELECTION: { level: 'IMMEDIATE', pt: 'Treinamento e seleção', en: 'Training and selection', definitionPt: 'Adequação da seleção, conhecimentos, habilidades, treinamento e manutenção da proficiência.', definitionEn: 'Adequacy of selection, knowledge, skills, training, and proficiency maintenance.' },
  QUALIFICATION_AUTHORIZATION: { level: 'IMMEDIATE', pt: 'Qualificação e autorização', en: 'Qualification and authorization', definitionPt: 'Pré-requisitos formais e legais de qualificação e autorização para realizar a atividade.', definitionEn: 'Formal and legal qualification and authorization prerequisites for the activity.' },
  TIME_PRESSURE: { level: 'IMMEDIATE', pt: 'Pressão do tempo', en: 'Time pressure', definitionPt: 'Condição da tarefa em que o tempo disponível para processar e responder é operacionalmente insuficiente ou muito restrito.', definitionEn: 'Task condition in which available time to process and respond is operationally insufficient or highly constrained.' },
  OBJECTIVES: { level: 'IMMEDIATE', pt: 'Objetivos', en: 'Objectives', definitionPt: 'Objetivos da tarefa pouco claros, inadequados, inconsistentes, incompatíveis com capacidade ou excessivamente arriscados.', definitionEn: 'Task objectives that are unclear, inadequate, inconsistent, incompatible with capability, or excessively risky.' },
  EQUIPMENT: { level: 'IMMEDIATE', pt: 'Equipamento', en: 'Equipment', definitionPt: 'Condição das ferramentas, controles, displays e interfaces utilizados para realizar a tarefa.', definitionEn: 'Condition of tools, controls, displays, and interfaces used to perform the task.' },
  WORKSPACE: { level: 'IMMEDIATE', pt: 'Espaço de trabalho', en: 'Workspace', definitionPt: 'Arranjo físico e layout do espaço de trabalho que pode restringir acesso, visão ou movimento.', definitionEn: 'Physical arrangement and workspace layout that may restrict access, visibility, or movement.' },
  ENVIRONMENT: { level: 'IMMEDIATE', pt: 'Ambiente', en: 'Environment', definitionPt: 'Condições ambientais da atividade, incluindo iluminação, clima, vento, gelo, ruído, vibração e outros perigos ambientais.', definitionEn: 'Environmental conditions of the activity, including lighting, weather, wind, icing, noise, vibration, and other environmental hazards.' },
  FORMING_INTENT: { level: 'COMMAND_CONTROL_SUPERVISION', pt: 'Formação do propósito', en: 'Forming intent', definitionPt: 'Falha na formação dos objetivos da tarefa ou na atribuição de responsabilidades por gerentes e supervisores.', definitionEn: 'Failure in forming task objectives or assigning responsibilities by managers and supervisors.' },
  COMMUNICATING_INTENT: { level: 'COMMAND_CONTROL_SUPERVISION', pt: 'Comunicação do propósito', en: 'Communicating intent', definitionPt: 'Falha em comunicar de forma clara a intenção e os objetivos aos responsáveis pela execução.', definitionEn: 'Failure to clearly communicate intent and objectives to those responsible for execution.' },
  MONITORING_SUPERVISION: { level: 'COMMAND_CONTROL_SUPERVISION', pt: 'Monitoramento e supervisão', en: 'Monitoring and supervision', definitionPt: 'Atividade de monitoramento ou supervisão ausente, atrasada ou inadequada para corrigir desvios.', definitionEn: 'Monitoring or supervision activity absent, delayed, or inadequate to correct deviations.' },
  MISSION: { level: 'ORGANIZATIONAL', pt: 'Missão', en: 'Mission', definitionPt: 'Missão pouco clara, não aprovada ou incompatível com os recursos disponíveis.', definitionEn: 'Mission that is unclear, unapproved, or incompatible with available resources.' },
  PROVISION_RESOURCES: { level: 'ORGANIZATIONAL', pt: 'Provisão de recursos', en: 'Provision of resources', definitionPt: 'Gestão e provisão de recursos humanos, materiais e financeiros necessários à tarefa.', definitionEn: 'Management and provision of human, material, and financial resources required for the task.' },
  RULES_REGULATIONS: { level: 'ORGANIZATIONAL', pt: 'Regras e regulamentos', en: 'Rules and regulations', definitionPt: 'Adequação das regras e regulamentos como restrições e salvaguardas para operações seguras.', definitionEn: 'Adequacy of rules and regulations as constraints and safeguards for safe operations.' },
  ORGANIZATIONAL_PROCESS_PRACTICES: { level: 'ORGANIZATIONAL', pt: 'Processos e práticas organizacionais', en: 'Organizational process and practices', definitionPt: 'Procedimentos, operações e práticas formais que determinam como o trabalho é realizado.', definitionEn: 'Procedures, operations, and formal practices that determine how work is performed.' },
  ORGANIZATIONAL_CLIMATE: { level: 'ORGANIZATIONAL', pt: 'Clima organizacional', en: 'Organizational climate', definitionPt: 'Atmosfera, políticas, estrutura e cultura que moldam atitudes de trabalhadores e gestores em relação à segurança.', definitionEn: 'Atmosphere, policies, structure, and culture shaping worker and management attitudes toward safety.' },
  OVERSIGHT: { level: 'ORGANIZATIONAL', pt: 'Vigilância', en: 'Oversight', definitionPt: 'Métodos organizacionais de autoestudo, gerenciamento de risco, monitoramento e correção de problemas sistêmicos.', definitionEn: 'Organizational methods for self-study, risk management, monitoring, and correction of systemic problems.' },
}

const P = (...items: SeraCanonicalPreconditionCategory[]) => items

/** Hendy Table 1 + Annex B, as translated/applied by Daumas. No-failure leaves intentionally map to []. */
export const SERA_MOST_LIKELY_PRECONDITIONS: Record<string, SeraCanonicalPreconditionCategory[]> = {
  'P-A': [],
  'P-B': P('PHYSIOLOGICAL','PERSONAL_READINESS','TRAINING_SELECTION','OBJECTIVES','EQUIPMENT','ENVIRONMENT','MONITORING_SUPERVISION','ORGANIZATIONAL_PROCESS_PRACTICES','OVERSIGHT'),
  'P-C': P('TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','OBJECTIVES','FORMING_INTENT','COMMUNICATING_INTENT','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','ORGANIZATIONAL_PROCESS_PRACTICES','OVERSIGHT'),
  'P-D': P('PHYSIOLOGICAL','PSYCHOLOGICAL','TRAINING_SELECTION','TIME_PRESSURE','EQUIPMENT','ENVIRONMENT','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
  'P-E': P('TRAINING_SELECTION','TIME_PRESSURE','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
  'P-F': P('PHYSIOLOGICAL','PSYCHOLOGICAL','TRAINING_SELECTION','EQUIPMENT','ENVIRONMENT','MONITORING_SUPERVISION','ORGANIZATIONAL_PROCESS_PRACTICES','ORGANIZATIONAL_CLIMATE','OVERSIGHT'),
  'P-G': P('PHYSIOLOGICAL','PSYCHOLOGICAL','SOCIAL','PERSONAL_READINESS','TIME_PRESSURE','EQUIPMENT','ENVIRONMENT','MONITORING_SUPERVISION','PROVISION_RESOURCES','ORGANIZATIONAL_PROCESS_PRACTICES','ORGANIZATIONAL_CLIMATE','OVERSIGHT'),
  'P-H': P('PSYCHOLOGICAL','SOCIAL','EQUIPMENT','ENVIRONMENT','MONITORING_SUPERVISION','ORGANIZATIONAL_PROCESS_PRACTICES','ORGANIZATIONAL_CLIMATE','OVERSIGHT'),
  'O-A': [],
  'O-B': P('PSYCHOLOGICAL','SOCIAL','TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','TIME_PRESSURE','OBJECTIVES','FORMING_INTENT','COMMUNICATING_INTENT','MONITORING_SUPERVISION','RULES_REGULATIONS','ORGANIZATIONAL_CLIMATE','OVERSIGHT'),
  'O-C': P('PSYCHOLOGICAL','SOCIAL','TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','TIME_PRESSURE','OBJECTIVES','FORMING_INTENT','COMMUNICATING_INTENT','MONITORING_SUPERVISION','RULES_REGULATIONS'),
  'O-D': P('PSYCHOLOGICAL','TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','OBJECTIVES','FORMING_INTENT','COMMUNICATING_INTENT','MONITORING_SUPERVISION','MISSION','RULES_REGULATIONS','ORGANIZATIONAL_PROCESS_PRACTICES','ORGANIZATIONAL_CLIMATE','OVERSIGHT'),
  'A-A': [],
  'A-B': P('SOCIAL','TIME_PRESSURE','ENVIRONMENT','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
  'A-C': P('TRAINING_SELECTION','EQUIPMENT','RULES_REGULATIONS','ORGANIZATIONAL_PROCESS_PRACTICES','OVERSIGHT'),
  'A-D': P('PHYSIOLOGICAL','PERSONAL_READINESS','TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','OBJECTIVES','EQUIPMENT','WORKSPACE','ENVIRONMENT','MONITORING_SUPERVISION','PROVISION_RESOURCES','ORGANIZATIONAL_PROCESS_PRACTICES','OVERSIGHT'),
  'A-E': P('TRAINING_SELECTION','QUALIFICATION_AUTHORIZATION','MONITORING_SUPERVISION','MISSION','ORGANIZATIONAL_PROCESS_PRACTICES','OVERSIGHT'),
  'A-F': P('PSYCHOLOGICAL'),
  'A-G': P('PHYSIOLOGICAL','PSYCHOLOGICAL','SOCIAL','EQUIPMENT','MONITORING_SUPERVISION'),
  'A-H': P('TRAINING_SELECTION','TIME_PRESSURE','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
  'A-I': P('TIME_PRESSURE','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
  'A-J': P('TIME_PRESSURE','MONITORING_SUPERVISION','MISSION','PROVISION_RESOURCES','OVERSIGHT'),
}

function n(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }

export function classifyCanonicalPrecondition(text: string): SeraCanonicalPreconditionCategory | null {
  const x = n(text)
  const explicitTechnicalFailure = /\b(pane|fault|malfunction|falha tecnica|technical failure|inoperante|inoperative)\b/.test(x)
    && /\b(sistema|system|equipamento|equipment|sensor|display|automation|automacao|de-icing|airframe|anti-icing|boots?|motor|engine|rudder|leme|trim)\b/.test(x)
  if (explicitTechnicalFailure) return 'EQUIPMENT'
  const rules: Array<[SeraCanonicalPreconditionCategory, RegExp]> = [
    ['QUALIFICATION_AUTHORIZATION', /\b(qualifica|habilita|autorizad|authorization|qualified|licen[cs])\b/],
    ['TRAINING_SELECTION', /\b(treinamento|training|selecao|selection|profici|familiaridade|unfamiliar|knowledge gap|conhecimento insuficiente)\b/],
    ['PERSONAL_READINESS', /\b(prontidao|personal readiness|descanso|rest|alcool|alcohol|medicamento|medication|lentes corretivas|corrective lenses)\b/],
    ['PHYSIOLOGICAL', /\b(fadiga|fatigue|sonol|drows|doenca|illness|hipoxia|hypoxia|fisiolog|physiolog|toxicolog|circadian)\b/],
    ['PHYSICAL_CAPABILITY', /\b(capacidade fisica|physical capability|forca muscular|strength|alcance|reach|destreza|dexterity|acuidade visual|visual acuity|audicao|hearing)\b/],
    ['SOCIAL', /\b(gradiente de autoridade|authority gradient|pressao dos pares|peer pressure|assertiv|receptiv|coesao|cohesion|lideranca|leadership|crm|teamwork)\b/],
    ['PSYCHOLOGICAL', /\b(psicolog|psycholog|complac|resign|motivacao|motivation|distrac|distraction|estresse|stress|visao de tunel|tunnel vision|confirmation bias|vies de confirmacao|overconfidence|excesso de confianca|fixacao|fixation)\b/],
    ['TIME_PRESSURE', /\b(pressao de tempo|time pressure|rushed|apressad|prazo curto|tight schedule|running late|behind schedule)\b/],
    ['OBJECTIVES', /\b(objetiv|goal|meta da tarefa|task goal|risk.?benefit|risco.?beneficio)\b/],
    ['WORKSPACE', /\b(espaco de trabalho|workspace|cockpit layout|layout do cockpit|obstruc|inacessivel|inaccessible)\b/],
    ['ENVIRONMENT', /\b(ambiente|environment|meteorolog|weather|vento|wind|chuva|rain|gelo|icing|nevoa|fog|iluminacao|lighting|ruido|noise|vibracao|vibration)\b/],
    ['EQUIPMENT', /\b(equipamento|equipment|display|interface|system|sistema|defeituos|defective|falha tecnica|technical failure|malfunction|painel de controle|control panel|comando de voo|comandos de voo|flight control|flight controls)\b/],
    ['FORMING_INTENT', /\b(formacao do proposito|forming intent|objetivos? .*gerent|goals? .*management|expectativas? irreais|unrealistic expectations)\b/],
    ['COMMUNICATING_INTENT', /\b(comunicacao do proposito|communicating intent|intencao .*comunicad|intent .*communicat)\b/],
    ['MONITORING_SUPERVISION', /\b(monitoramento e supervisao|monitoring and supervision|supervisao|supervision|supervisor)\b/],
    ['MISSION', /\b(missao|mission)\b/],
    ['PROVISION_RESOURCES', /\b(provisao de recursos|provision of resources|falta de recursos|resource shortage|staffing|efetivo reduzido)\b/],
    ['RULES_REGULATIONS', /\b(regras? e regulamentos?|rules? and regulations?|regulament|regulation|norma|rule)\b/],
    ['ORGANIZATIONAL_PROCESS_PRACTICES', /\b(processos? e praticas organizacionais|organizational process|procedimentos? organizacionais|change management|gestao de mudanca)\b/],
    ['ORGANIZATIONAL_CLIMATE', /\b(clima organizacional|organizational climate|cultura de seguranca|safety culture|normalizacao do desvio|normalization of deviation)\b/],
    ['OVERSIGHT', /\b(vigilancia|oversight|problema sistemico|systemic problem|acao corretiva|corrective action)\b/],
  ]
  return rules.find(([, rule]) => rule.test(x))?.[0] ?? null
}

export function mostLikelyPreconditionsForCodes(codes: Array<string | null | undefined>): Set<SeraCanonicalPreconditionCategory> {
  const out = new Set<SeraCanonicalPreconditionCategory>()
  for (const code of codes) if (code) for (const category of SERA_MOST_LIKELY_PRECONDITIONS[code] ?? []) out.add(category)
  return out
}
