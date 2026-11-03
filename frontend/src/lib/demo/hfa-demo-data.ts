// Demo data only. Do not use for operational analysis.

export type DemoAnalysis = {
  id: string
  title: string
  context: string
  perception_code: string
  objective_code: string
  action_code: string
  hfa_erc_category: 1 | 2 | 3 | 4 | 5
  summary: string
  recommendation: string
}

export type DemoRecurringPattern = {
  id: string
  label: string
  count: number
  note: string
}

export type DemoSafetyIssueCandidate = {
  id: string
  label: string
  count: number
  share: number
  confidence: 'preliminary' | 'moderate'
  caveat: string
}

export type DemoCorrectiveAction = {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'closed'
  priority: 'low' | 'medium' | 'high'
  due_label: string
}

export type DemoQualityTrendPoint = {
  month: string
  dominant_hfa_erc_category: 1 | 2 | 3 | 4 | 5
  critical_or_high_share: number
  note: string
}

export type DemoDataConfidence = {
  level: 'insufficient' | 'limited' | 'moderate' | 'strong'
  total_analyses: number
  minimum_recommended: number
  valid_erc_count: number
  valid_erc_share: number
  messages: string[]
  caveat: string
}

const SAFETY_ISSUE_CAVEAT =
  'Candidato fictício para treinamento. Safety Issue formal exige revisão humana, contexto, exposicao e barreiras.'

export const demoAnalyses: DemoAnalysis[] = [
  {
    id: 'demo-001',
    title: 'Atraso na identificação de condição anormal',
    context: 'Operação offshore genérica em aproximação final com informação ambiental degradada.',
    perception_code: 'P-B',
    objective_code: 'O-D',
    action_code: 'A-G',
    hfa_erc_category: 5,
    summary: 'A equipe detectou tarde uma condição anormal e manteve uma intenção operacional pouco conservativa.',
    recommendation: 'Reforçar critérios de descontinuação e checkpoints verbais para condições anormais.',
  },
  {
    id: 'demo-002',
    title: 'Execução incompleta de checklist',
    context: 'Troca de turno em ambiente industrial com transferência verbal abreviada.',
    perception_code: 'P-G',
    objective_code: 'O-A',
    action_code: 'A-B',
    hfa_erc_category: 3,
    summary: 'Itens críticos do checklist foram omitidos por atenção fragmentada durante a transição.',
    recommendation: 'Padronizar pausa operacional curta antes da liberação final da tarefa.',
  },
  {
    id: 'demo-003',
    title: 'Comunicação tardia entre funções',
    context: 'Coordenação entre sala de controle e equipe de campo durante resposta a desvio operacional.',
    perception_code: 'P-H',
    objective_code: 'O-A',
    action_code: 'A-C',
    hfa_erc_category: 2,
    summary: 'A informação correta existia, mas chegou tarde e sem confirmação de entendimento.',
    recommendation: 'Implantar confirmação fechada de mensagens em eventos fora da rotina.',
  },
  {
    id: 'demo-004',
    title: 'Decisão operacional sob pressão de tempo',
    context: 'Janela curta para completar tarefa crítica antes de restrição de agenda operacional.',
    perception_code: 'P-D',
    objective_code: 'O-D',
    action_code: 'A-I',
    hfa_erc_category: 4,
    summary: 'A pressão de tempo influenciou a escolha de uma alternativa menos conservativa.',
    recommendation: 'Definir gatilhos formais para escalonamento quando houver compressao de tempo.',
  },
  {
    id: 'demo-005',
    title: 'Ação corretiva após desvio de procedimento',
    context: 'Equipe executou atividade prevista, mas sem confirmar efeito após intervenção.',
    perception_code: 'P-A',
    objective_code: 'O-A',
    action_code: 'A-G',
    hfa_erc_category: 2,
    summary: 'O objetivo era adequado, mas faltou monitoramento do resultado da ação aplicada.',
    recommendation: 'Incluir verificação obrigatória de efeito antes de encerrar a resposta.',
  },
  {
    id: 'demo-006',
    title: 'Nova ocorrência de condição anormal não percebida',
    context: 'Operação offshore genérica com atenção concentrada em meta secundária.',
    perception_code: 'P-B',
    objective_code: 'O-D',
    action_code: 'A-F',
    hfa_erc_category: 5,
    summary: 'A situação crítica voltou a ser detectada tarde e a equipe insistiu em alternativa com menor margem.',
    recommendation: 'Treinar reconhecimento de sinais precoces e reforçar critérios de abandono da tarefa.',
  },
  {
    id: 'demo-007',
    title: 'Informacao ambígua em interface operacional',
    context: 'Painel apresentava indicações pouco discrimináveis durante ajuste de configuração.',
    perception_code: 'P-F',
    objective_code: 'O-A',
    action_code: 'A-G',
    hfa_erc_category: 4,
    summary: 'A equipe interpretou uma indicação ambígua como normal e não verificou o efeito da ação subsequente.',
    recommendation: 'Revisar padrão de sinalização e incluir dupla confirmação em mudanças sensíveis.',
  },
  {
    id: 'demo-008',
    title: 'Recorrência de feedback insuficiente após ajuste',
    context: 'Rotina de reconfiguração com comunicação mínima entre supervisor e executor.',
    perception_code: 'P-F',
    objective_code: 'O-A',
    action_code: 'A-G',
    hfa_erc_category: 4,
    summary: 'A ambiguidade de indicação foi seguida de ação sem checagem robusta do resultado obtido.',
    recommendation: 'Padronizar etapa de validação independente após cada ajuste de configuração.',
  },
  {
    id: 'demo-009',
    title: 'Terceira recorrência de sinal ambígua sem verificação',
    context: 'Operação de rotina com equipe experiente e elevada confiança na leitura do sistema.',
    perception_code: 'P-F',
    objective_code: 'O-A',
    action_code: 'A-G',
    hfa_erc_category: 4,
    summary: 'O padrão se repetiu com interpretação ambígua seguida de ausência de feedback estruturado.',
    recommendation: 'Criar revisão de interface e reforço de treinamento para reconhecimento de ambiguidade.',
  },
  {
    id: 'demo-010',
    title: 'Terceira ocorrência de intenção pouco conservativa',
    context: 'Equipe pressionada por agenda operacional e variacao ambiental na fase final da tarefa.',
    perception_code: 'P-B',
    objective_code: 'O-D',
    action_code: 'A-H',
    hfa_erc_category: 5,
    summary: 'Novamente houve atraso na percepção da condição anormal combinado com objetivo menos conservativo.',
    recommendation: 'Reforçar pausa decisoria e autoridade para interromper a operação sem penalidade cultural.',
  },
]

export const demoRecurringPatterns: DemoRecurringPattern[] = [
  {
    id: 'pattern-001',
    label: 'P-B + O-D',
    count: 3,
    note: 'Atraso de percepção combinado com intenção não conservativa em cenarios de pressão operacional.',
  },
  {
    id: 'pattern-002',
    label: 'P-F + A-G',
    count: 3,
    note: 'Informacao ambígua seguida de baixa verificação do efeito da ação adotada.',
  },
  {
    id: 'pattern-003',
    label: 'Pressao operacional e de tempo',
    count: 4,
    note: 'Precondicao recorrente em tarefas com janela operacional comprimida.',
  },
]

export const demoSafetyIssueCandidates: DemoSafetyIssueCandidate[] = [
  {
    id: 'candidate-001',
    label: 'P-B + O-D',
    count: 3,
    share: 0.3,
    confidence: 'moderate',
    caveat: SAFETY_ISSUE_CAVEAT,
  },
  {
    id: 'candidate-002',
    label: 'P-F + A-G',
    count: 3,
    share: 0.3,
    confidence: 'moderate',
    caveat: SAFETY_ISSUE_CAVEAT,
  },
]

export const demoCorrectiveActions: DemoCorrectiveAction[] = [
  {
    id: 'action-001',
    title: 'Padronizar critérios de interrupção em condição anormal',
    status: 'in_progress',
    priority: 'high',
    due_label: 'Revisão em 15 dias',
  },
  {
    id: 'action-002',
    title: 'Revisar checklist de transferência entre funções',
    status: 'pending',
    priority: 'medium',
    due_label: 'Planejada para o próximo ciclo de treinamento',
  },
  {
    id: 'action-003',
    title: 'Atualizar validação de feedback após ajuste sensivel',
    status: 'pending',
    priority: 'high',
    due_label: 'Aprovacao técnica em 7 dias',
  },
  {
    id: 'action-004',
    title: 'Concluir reforço de comunicação fechada',
    status: 'closed',
    priority: 'medium',
    due_label: 'Concluída no ultimo mes',
  },
]

export const demoQualityTrend: DemoQualityTrendPoint[] = [
  {
    month: '2026-01',
    dominant_hfa_erc_category: 3,
    critical_or_high_share: 0.33,
    note: 'Base inicial com sinais moderados e um evento de maior severidade relativa.',
  },
  {
    month: '2026-02',
    dominant_hfa_erc_category: 4,
    critical_or_high_share: 0.67,
    note: 'A recorrência de informação ambígua elevou a proporcao de categorias 4 e 5.',
  },
  {
    month: '2026-03',
    dominant_hfa_erc_category: 5,
    critical_or_high_share: 0.75,
    note: 'Persistencia de pressão operacional e intenção pouco conservativa no fechamento do período.',
  },
]

export const demoDataConfidence: DemoDataConfidence = {
  level: 'strong',
  total_analyses: 10,
  minimum_recommended: 10,
  valid_erc_count: 10,
  valid_erc_share: 1,
  messages: [
    'A base fictícia contem 10 análises para demonstrar sinais organizacionais iniciais.',
    'Os candidatos a Safety Issue indicam recorrência observada em um conjunto de treinamento.',
    'Mesmo nesta demonstracao, o perfil deve ser lido como exemplo pedagogico e não como operação real.',
  ],
  caveat:
    'Dados fictícios para treinamento. Esta demonstracao ilustra a leitura do produto, não um diagnostico operacional valido.',
}
