import type { SeraVNextEngineInput } from '../engine-contract'

export type SeraEngineLocale = SeraVNextEngineInput['locale']

export function isPt(locale: SeraEngineLocale): boolean {
  return locale === 'pt-BR'
}

const RATIONALE_PT: Record<string, string> = {
  'Root node starts canonical perception traversal.': 'O nó raiz inicia a travessia canônica de Percepção.',
  'Pre-escape evidence supports inaccurate or inadequate situation assessment.': 'A evidência anterior ao ponto de fuga sustenta uma avaliação imprecisa ou inadequada da situação.',
  'Pre-escape evidence supports adequate perception or timely recognition.': 'A evidência anterior ao ponto de fuga sustenta percepção adequada ou reconhecimento em tempo hábil.',
  'No pre-escape evidence answers whether assessment was adequate.': 'Não há evidência anterior ao ponto de fuga suficiente para determinar se a avaliação da situação foi adequada.',
  'Evidence localizes the perception issue to sensory/perceptual capability.': 'A evidência localiza a questão perceptiva na capacidade sensorial/perceptiva.',
  'Evidence localizes the perception issue to knowledge/training capability.': 'A evidência localiza a questão perceptiva em conhecimento ou treinamento.',
  'Positive evidence shows that the issue can be evaluated in the information/attention branches rather than being assumed to be sensory or knowledge incapacity.': 'Há evidência positiva para avaliar o caso nos ramos de informação/atenção, sem presumir incapacidade sensorial ou de conhecimento.',
  'The text does not identify a canonical capability subtype.': 'O texto não permite identificar um subtipo canônico de capacidade.',
  'Attention impairment is supported together with explicit excessive time/urgency pressure.': 'Há evidência de prejuízo de atenção associado a pressão excessiva de tempo/urgência.',
  'Explicit excessive time-management pressure is supported.': 'Há evidência explícita de pressão excessiva de gerenciamento do tempo.',
  'Attention-demand evidence exists without explicit excessive time pressure; continue to information-quality branches and retain attention as contextual evidence only.': 'Há evidência de demanda de atenção sem pressão excessiva de tempo explícita; a análise prossegue para os ramos de qualidade da informação, mantendo atenção apenas como contexto.',
  'No evidence answers whether perceived time pressure was excessive.': 'Não há evidência suficiente para determinar se a pressão de tempo percebida era excessiva.',
  'Information ambiguity is explicit.': 'A ambiguidade da informação está explicitamente sustentada.',
  'Information evidence is present but ambiguity is not supported.': 'Há evidência sobre a informação, mas não há suporte para ambiguidade.',
  'No explicit information-quality evidence is available.': 'Não há evidência explícita suficiente sobre a qualidade da informação.',
  'Evidence supports information being available and correct.': 'A evidência sustenta que a informação estava disponível e correta.',
  'Evidence supports missing or unavailable information.': 'A evidência sustenta informação ausente ou indisponível.',
  'Available/correct information is not established strongly enough for a P-G/P-H leaf.': 'A disponibilidade/correção da informação não está suficientemente estabelecida para fechar um ramo P-G/P-H.',
  'Root node starts canonical objective traversal.': 'O nó raiz inicia a travessia canônica de Objetivo.',
  'Objective evidence supports a safe or rule-consistent goal.': 'A evidência do objetivo sustenta uma meta segura ou compatível com as regras.',
  'Violation path opened by known-rule, awareness, and conscious-deviation evidence within contextual proximity.': 'O ramo de violação foi aberto por evidência próxima de regra conhecida, consciência e desvio consciente.',
  'Violation path opened by known-rule, awareness, and conscious-deviation evidence (all three present without negation).': 'O ramo de violação foi aberto por evidência de regra conhecida, consciência e desvio consciente, sem negação.',
  'Known-rule plus conscious-deviation evidence blocks the non-violation risk-management branch until explicit awareness completes the O-C evidence.': 'Regra conhecida e desvio consciente bloqueiam o ramo de gerenciamento de risco sem violação até que haja evidência explícita de consciência para completar O-C.',
  'Goal evidence is rule-compatible enough to test risk-management adequacy without inferring violation.': 'A evidência do objetivo é suficientemente compatível com as regras para testar o gerenciamento de risco sem inferir violação.',
  'No pre-escape goal evidence answers rule/risk consistency.': 'Não há evidência anterior ao ponto de fuga suficiente para determinar a consistência do objetivo com regras e risco.',
  'Routine violation requires positive normalization/habit evidence together with rule awareness.': 'Violação rotineira exige evidência positiva de normalização/hábito juntamente com consciência da regra.',
  'Exceptional violation is explicitly supported together with rule awareness.': 'Há suporte explícito para violação excepcional juntamente com consciência da regra.',
  'A conscious rule deviation is established and no positive evidence of normalization/habit exists; the canonical non-routine branch is O-C.': 'Está estabelecido um desvio consciente de regra sem evidência positiva de normalização/hábito; o ramo canônico não rotineiro é O-C.',
  'Violation subtype is not established.': 'O subtipo de violação não está estabelecido.',
  'Evidence supports a rule-compatible but non-conservative or unmanaged-risk objective.': 'A evidência sustenta um objetivo compatível com regras, porém não conservador ou com risco não gerenciado.',
  'Positive evidence supports a nominal rule-consistent operational goal; no independent unsafe objective is established.': 'Há evidência positiva de objetivo operacional nominal e compatível com as regras; não foi estabelecido objetivo inseguro independente.',
  'Managed-risk status is not established.': 'Não há evidência suficiente para estabelecer a condição de gerenciamento do risco.',
  'Root node starts canonical action traversal.': 'O nó raiz inicia a travessia canônica de Ação.',
  'Evidence supports an independent failure in feedback/verification of the actor own action.': 'A evidência sustenta falha independente de feedback/verificação da própria ação do ator.',
  'Evidence supports an independent slip/lapse/error in action implementation before the consequence.': 'A evidência sustenta deslize/lapso/erro independente na implementação da ação antes da consequência.',
  'Evidence supports that an action was implemented and can be tested for adequacy.': 'A evidência sustenta que uma ação foi implementada e pode ser avaliada quanto à adequação.',
  'An action was implemented consistently with the actor perceived state; perception-linked wording is not double-counted as an independent implementation failure.': 'Uma ação foi implementada de forma coerente com o estado percebido pelo ator; a evidência ligada à percepção não é contada novamente como falha independente de implementação.',
  'No pre-escape action implementation evidence is sufficient.': 'Não há evidência anterior ao ponto de fuga suficiente para estabelecer como a ação foi implementada.',
  'The response was eventually executed, but explicit delay/hesitation makes execution timing independently inadequate.': 'A resposta foi executada, porém atraso/hesitação explícitos tornam o tempo de execução independentemente inadequado.',
  'Action evidence supports an adequate response.': 'A evidência da ação sustenta uma resposta adequada.',
  'The action was coherent with the actor incorrect perceived state and no independent action-selection/implementation mechanism is established; A-axis double counting is avoided.': 'A ação foi coerente com o estado percebido incorretamente pelo ator e não há mecanismo independente de seleção/implementação; evita-se dupla contagem no eixo A.',
  'Evidence supports an independent implemented but inadequate action, selection, or execution timing.': 'A evidência sustenta ação implementada porém inadequada, erro de seleção ou inadequação do tempo de execução.',
  'Correctness of action is not established.': 'A adequação/correção da ação não está estabelecida.',
  'Evidence supports physical/capability limitation.': 'A evidência sustenta limitação física/de capacidade.',
  'Evidence supports knowledge/skill limitation.': 'A evidência sustenta limitação de conhecimento/habilidade.',
  'A specific executed/omitted action mechanism provides positive evidence to continue subtype discrimination; capability is not inferred merely from absence of limitation.': 'Um mecanismo específico de ação executada/omitida fornece evidência positiva para continuar a discriminação do subtipo; capacidade não é inferida apenas pela ausência de limitação.',
  'Action capability cannot be assumed without positive evidence.': 'A capacidade para a ação não pode ser presumida sem evidência positiva.',
  'Evidence supports selection failure under excessive time pressure.': 'A evidência sustenta falha de seleção sob pressão excessiva de tempo.',
  'Evidence supports feedback or communication failure under excessive time pressure.': 'A evidência sustenta falha de feedback ou comunicação sob pressão excessiva de tempo.',
  'Evidence supports third-party feedback, supervision, or coordination failure without dominant time pressure.': 'A evidência sustenta falha de feedback de terceiro, supervisão ou coordenação sem pressão de tempo dominante.',
  'Evidence supports action-selection failure without dominant time pressure.': 'A evidência sustenta falha de seleção da ação sem pressão de tempo dominante.',
  'Evidence supports time-management action subtype.': 'A evidência sustenta subtipo de ação relacionado ao gerenciamento do tempo.',
  'Action subtype under time pressure is not established.': 'O subtipo de ação sob pressão de tempo não está estabelecido.',
}

export function localizeRationale(text: string, locale: SeraEngineLocale): string {
  const enStopSuffix = ' Traversal stops without a reconstructed leaf.'
  const ptStopSuffix = ' A travessia foi interrompida sem reconstruir um código terminal.'
  if (isPt(locale)) {
    const hasStop = text.endsWith(enStopSuffix)
    const base = hasStop ? text.slice(0, -enStopSuffix.length) : text
    const translated = RATIONALE_PT[base] ?? (base.startsWith('Unsupported ') ? 'O nó canônico solicitado não é suportado pela árvore ativa.' : base)
    return hasStop ? `${translated}${ptStopSuffix}` : translated
  }
  const reverse = new Map(Object.entries(RATIONALE_PT).map(([en, pt]) => [pt, en]))
  const hasPtStop = text.endsWith(ptStopSuffix)
  const base = hasPtStop ? text.slice(0, -ptStopSuffix.length) : text
  const translated = reverse.get(base) ?? (base === 'O nó canônico solicitado não é suportado pela árvore ativa.' ? 'The requested canonical node is not supported by the active tree.' : base)
  return hasPtStop ? `${translated}${enStopSuffix}` : translated
}

export function localizeActor(actor: string | null, locale: SeraEngineLocale): string | null {
  if (!actor) return actor
  const normalized = actor.toLowerCase()
  if (isPt(locale)) {
    if (normalized === 'maintenance team (collective)') return 'equipe de manutenção (coletivo)'
    if (normalized === 'maintenance inspector') return 'inspetor de manutenção'
    if (normalized === 'maintenance technician' || normalized === 'maintenance') return 'técnico/equipe de manutenção'
    if (normalized === 'flight crew (collective)') return 'tripulação de voo (coletivo)'
    if (normalized === 'pilot') return 'piloto'
    if (normalized === 'first officer') return 'copiloto'
    if (normalized === 'captain') return 'comandante'
    if (normalized === 'atc') return 'controle de tráfego aéreo'
    return actor
  }
  if (normalized === 'equipe de manutenção (coletivo)') return 'maintenance team (collective)'
  if (normalized === 'inspetor de manutenção') return 'maintenance inspector'
  if (normalized === 'técnico/equipe de manutenção' || normalized === 'manutenção') return 'maintenance team'
  if (normalized === 'tripulação de voo (coletivo)' || normalized === 'tripulação') return 'flight crew (collective)'
  if (normalized === 'piloto') return 'pilot'
  if (normalized === 'copiloto') return 'first officer'
  if (normalized === 'comandante') return 'captain'
  if (normalized === 'controle de tráfego aéreo') return 'ATC'
  return actor
}

export function localizeAssuranceText(text: string, locale: SeraEngineLocale): string {
  const map: Record<string, string> = {
    'Direct actor remains ambiguous or not applicable.': 'O ator direto permanece ambíguo ou não aplicável.',
    'Canonical traversal remains partial for at least one axis.': 'A travessia canônica permanece parcial em pelo menos um eixo.',
    'Escape point is a progressive zone and its exact boundary remains non-final.': 'O ponto de fuga é uma zona progressiva e sua fronteira exata permanece não final.',
    'Post-escape evidence was quarantined from causal traversal.': 'Evidências posteriores ao ponto de fuga foram isoladas da travessia causal.',
    'No candidate-only precondition could be supported from available evidence.': 'Nenhuma pré-condição causal candidata pôde ser sustentada pela evidência disponível.',
    'Escape point remains a progressive zone and requires human boundary confirmation.': 'O ponto de fuga permanece uma zona progressiva e requer confirmação humana de sua fronteira.',
  }
  if (isPt(locale)) return map[text] ?? text
  const reverse = new Map(Object.entries(map).map(([en, pt]) => [pt, en]))
  return reverse.get(text) ?? text
}
