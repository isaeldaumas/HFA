import type { SeraPreconditionCandidate, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { SERA_PRECONDITION_META, type SeraCanonicalPreconditionCategory, type SeraPreconditionLevel } from '@/lib/sera-vnext/precondition-taxonomy'

export type SeraActionSuggestion = {
  id: string
  analysisId: string
  eventId: string | null
  eventTitle?: string | null
  analysisTitle: string
  kind: 'CORRECTIVE_PREVENTIVE' | 'INVESTIGATION'
  readiness: 'READY_FOR_HUMAN_ADOPTION' | 'INVESTIGATE_FIRST'
  title: string
  description: string
  relatedFailure: string
  canonicalCategory: SeraCanonicalPreconditionCategory | null
  preconditionId: string
  preconditionLabel: string
  preconditionLevel: SeraPreconditionLevel
  sourceRuleIds: string[]
  evidence: string[]
  linkedCodes: string[]
}

type Template = { title: string; control: string; investigate: string }

const TEMPLATES: Record<SeraCanonicalPreconditionCategory, Template> = {
  PHYSIOLOGICAL: { title: 'Reforçar controles de fadiga e aptidão', control: 'Revisar barreiras de fadiga, aptidão e prontidão para a tarefa, definindo critérios objetivos de impedimento e escalonamento.', investigate: 'Levantar descanso, jornada, condição fisiológica e demais fatores de prontidão anteriores à tarefa.' },
  PSYCHOLOGICAL: { title: 'Reduzir vulnerabilidades de atenção e decisão', control: 'Revisar desenho da tarefa, briefings e barreiras contra distração, fixação, complacência e vieses de decisão identificados.', investigate: 'Buscar evidência de distração, fixação, complacência, estresse ou vieses de processamento no período causal.' },
  SOCIAL: { title: 'Fortalecer coordenação e assertividade', control: 'Reforçar práticas de CRM, challenge-response, liderança e escalonamento para reduzir barreiras sociais à intervenção segura.', investigate: 'Verificar liderança, gradiente de autoridade, assertividade, pressão social e dinâmica de equipe.' },
  PHYSICAL_CAPABILITY: { title: 'Adequar tarefa à capacidade física', control: 'Revisar ergonomia, acessibilidade, esforço, alcance e demais condições físicas necessárias à execução segura.', investigate: 'Verificar se acesso, alcance, força, acuidade ou outra limitação física restringiu a tarefa.' },
  PERSONAL_READINESS: { title: 'Reforçar prontidão pessoal para a tarefa', control: 'Estabelecer ou revisar controles de prontidão pessoal antes da atividade, incluindo descanso, condição física e critérios de afastamento.', investigate: 'Levantar descanso, prontidão física/mental e demais condições pessoais anteriores à tarefa.' },
  TRAINING_SELECTION: { title: 'Corrigir lacuna de treinamento e proficiência', control: 'Revisar conteúdo, prática, avaliação e recorrência do treinamento específico, com verificação objetiva de proficiência na tarefa crítica.', investigate: 'Verificar treinamento, familiaridade, proficiência e experiência específica para a tarefa e situação.' },
  QUALIFICATION_AUTHORIZATION: { title: 'Reforçar barreiras de qualificação e autorização', control: 'Revisar requisitos de habilitação, autorização e liberação para impedir execução fora dos pré-requisitos formais.', investigate: 'Confirmar qualificação, habilitação e autorização formal aplicáveis à atividade.' },
  TIME_PRESSURE: { title: 'Reduzir pressão temporal sobre a tarefa', control: 'Revisar planejamento, recursos, janelas e critérios de stop-work para impedir que urgência operacional degrade percepção, decisão ou execução.', investigate: 'Identificar urgência, atraso, janela operacional ou pressão temporal concreta e seu efeito sobre a tarefa.' },
  OBJECTIVES: { title: 'Alinhar objetivos da tarefa com a operação segura', control: 'Revisar definição e priorização de objetivos para tornar explícitos limites, critérios de segurança e condições de interrupção.', investigate: 'Verificar clareza, prioridade e compatibilidade dos objetivos da tarefa com a operação segura.' },
  EQUIPMENT: { title: 'Melhorar barreiras técnicas e feedback do equipamento', control: 'Avaliar confiabilidade, interface, indicação de estado, alarmes e feedback do equipamento; implementar correções de engenharia ou manutenção quando justificadas.', investigate: 'Verificar condição, confiabilidade, ergonomia e feedback dos equipamentos, controles e interfaces usados.' },
  WORKSPACE: { title: 'Corrigir restrições do espaço de trabalho', control: 'Revisar layout, acesso, visibilidade e ergonomia do posto para eliminar restrições que favoreçam erro ou omissão.', investigate: 'Verificar acesso, visibilidade, layout e restrições físicas do espaço de trabalho.' },
  ENVIRONMENT: { title: 'Reforçar barreiras para condições ambientais', control: 'Revisar limites, planejamento e defesas aplicáveis às condições ambientais identificadas no evento.', investigate: 'Confirmar iluminação, meteorologia, ruído, vibração e outras exposições presentes no período causal.' },
  FORMING_INTENT: { title: 'Melhorar definição de objetivos e responsabilidades', control: 'Revisar como supervisão e gestão definem objetivos, prioridades, responsabilidades e critérios de sucesso da tarefa.', investigate: 'Verificar como objetivos, responsabilidades e prioridades foram definidos antes da execução.' },
  COMMUNICATING_INTENT: { title: 'Fechar o ciclo de comunicação do propósito', control: 'Padronizar briefing, readback e confirmação de responsabilidades, objetivos e alterações relevantes à tarefa.', investigate: 'Verificar como intenção, objetivos, responsabilidades e mudanças foram comunicados e confirmados.' },
  MONITORING_SUPERVISION: { title: 'Reforçar supervisão e verificação independente', control: 'Definir claramente pontos de supervisão, checagens independentes, critérios de liberação e evidência de execução para a etapa crítica.', investigate: 'Identificar quem supervisionava, quais checagens independentes eram requeridas e se foram executadas e registradas.' },
  MISSION: { title: 'Revisar critérios de aceitação da missão/tarefa', control: 'Definir critérios explícitos de aceitação, alteração e interrupção da missão, compatíveis com recursos e limites operacionais.', investigate: 'Verificar se a missão/tarefa estava claramente definida, aprovada e compatível com os recursos disponíveis.' },
  PROVISION_RESOURCES: { title: 'Adequar recursos à tarefa crítica', control: 'Revisar dimensionamento de pessoal, tempo, ferramentas, informações e suporte necessários para executar a tarefa com as barreiras previstas.', investigate: 'Verificar suficiência de pessoal, tempo, ferramentas, informações e suporte disponíveis.' },
  RULES_REGULATIONS: { title: 'Reforçar regra/procedimento como barreira', control: 'Revisar clareza, aplicabilidade, disponibilidade e pontos de verificação do procedimento/regra, removendo ambiguidades e atalhos previsíveis.', investigate: 'Verificar adequação, clareza, disponibilidade e aplicação das regras e procedimentos pertinentes.' },
  ORGANIZATIONAL_PROCESS_PRACTICES: { title: 'Redesenhar processo organizacional vulnerável', control: 'Revisar o fluxo de trabalho, responsabilidades, handoffs, registros e barreiras formais do processo que contribuiu para o evento.', investigate: 'Mapear processo, rotina, handoffs e práticas organizacionais presentes na cadeia causal.' },
  ORGANIZATIONAL_CLIMATE: { title: 'Tratar vulnerabilidade de clima/cultura de segurança', control: 'Definir ações sobre prioridades, reporte, tolerância a desvios e resposta gerencial, com indicadores de acompanhamento.', investigate: 'Buscar evidência de prioridades, tolerância a desvios, reporte e condições culturais que moldavam o comportamento.' },
  OVERSIGHT: { title: 'Fechar o ciclo de assurance e aprendizado', control: 'Revisar auditoria, monitoramento, indicadores e processo de correção para assegurar detecção de recorrência e eficácia das ações.', investigate: 'Verificar mecanismos de autoavaliação, auditoria, gerenciamento de risco e correção de problemas sistêmicos existentes antes do evento.' },
}

function supported(item: SeraPreconditionCandidate): boolean {
  return item.methodologyMatch !== 'HYPOTHESIS_ONLY'
    && (item.relationship === 'ENABLING_PRECONDITION' || item.relationship === 'CONTEXTUAL_PRECONDITION')
}

function canonicalOf(item: SeraPreconditionCandidate): SeraCanonicalPreconditionCategory | null {
  return item.canonicalCategory ?? null
}

export function buildSeraActionSuggestions(args: {
  analysisId: string
  eventId?: string | null
  analysisTitle: string
  output: SeraVNextEngineOutput
}): SeraActionSuggestion[] {
  const suggestions: SeraActionSuggestion[] = []
  for (const item of args.output.preconditions) {
    const canonical = canonicalOf(item)
    if (!canonical) continue
    const hasPositiveIdentificationBarrier = (args.output.factualExtraction?.evidence ?? []).some((evidence) =>
      evidence.sourceSection === 'REPORT_ANALYSIS'
      && evidence.assertionStatus === 'AFFIRMED'
      && /\b(c[oó]digo 9p|reconfirma[cç][aã]o|wrong deck|wdl|[uú]ltima barreira|pf.*pm|pm.*pf)\b/i.test(evidence.statement),
    )
    const environmentIsDestinationGeometry = canonical === 'ENVIRONMENT'
      && item.evidence.some((evidence) => /\b(proxim|rota.*unidade|unidade.*rota|plataforma|helideck|destino)\b/i.test(evidence))
    const template = environmentIsDestinationGeometry && hasPositiveIdentificationBarrier
      ? {
          title: 'Reforçar identificação positiva e barreiras PF–PM',
          control: 'Revisar a barreira de identificação positiva antes de comprometer aproximação/pouso em unidades próximas, incluindo anúncio objetivo do identificador pelo PF e confirmação independente pelo PM quando aplicável; tratar geometria/proximidade no briefing sem atribuir causalidade genérica à meteorologia.',
          investigate: 'Verificar distância/geometria entre destinos, critérios de identificação positiva, anúncio do identificador pelo PF, confirmação do PM e eventuais fatores de vento/meteorologia separadamente.',
        }
      : TEMPLATES[canonical]
    const isSupported = supported(item)
    const kind = isSupported ? 'CORRECTIVE_PREVENTIVE' as const : 'INVESTIGATION' as const
    const readiness = isSupported ? 'READY_FOR_HUMAN_ADOPTION' as const : 'INVESTIGATE_FIRST' as const
    const linkedCodes = item.likelyForActiveFailureCodes ?? []
    const label = SERA_PRECONDITION_META[canonical].pt
    suggestions.push({
      id: `${args.analysisId}:${kind}:${canonical}`,
      analysisId: args.analysisId,
      eventId: args.eventId ?? null,
      analysisTitle: args.analysisTitle,
      kind,
      readiness,
      title: isSupported ? template.title : `Investigar pré-condição: ${label}`,
      description: isSupported
        ? `${template.control} Base causal: ${label}${linkedCodes.length ? `, associada a ${linkedCodes.join(', ')}` : ''}. A medida deve ser validada pelo responsável técnico e ter eficácia acompanhada.`
        : `${template.investigate} Esta é uma hipótese orientada pela taxonomia/Tabela 1; não deve ser tratada como causa nem como ação corretiva definitiva antes de evidência factual.`,
      relatedFailure: isSupported ? `PC:${canonical}` : `INVESTIGATE:${canonical}`,
      canonicalCategory: canonical,
      preconditionId: item.id,
      preconditionLabel: label,
      preconditionLevel: SERA_PRECONDITION_META[canonical].level,
      sourceRuleIds: item.sourceRuleIds ?? [],
      evidence: item.evidence.slice(0, 3),
      linkedCodes,
    })
  }
  return suggestions
}
