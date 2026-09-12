export type ObjectiveOverrideResult = {
  code: 'O-B' | 'O-C' | 'O-D' | null
  reason: string
}

export function normalizeObjectiveText(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"''""\u2018\u2019\u201c\u201d`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function has(text: string, token: string): boolean {
  return text.includes(token)
}

function hasAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => has(text, token))
}

function hasExplicitProtectiveHumanIntent(text: string): boolean {
  const directPositive =
    hasAny(text, [
      'passageiro doente',
      'suspeita de infarto',
      'suspeita de avc',
      'emergencia medica',
      'necessidade medica',
      'evitar agravamento',
      'evitar piorar',
      'preservar paciente',
      'proteger pessoa',
      'proteger passageiro',
      'proteger paciente',
      'proteger equipe',
      'pessoa presa em area de risco',
      'colega preso em area de risco',
      'dano humano iminente',
      'deterioracao clinica',
      'mitigacao de dano humano',
      'atendimento imediato',
      'precisava de atendimento',
    ]) ||
    (has(text, 'passageiro') && (has(text, 'doente') || has(text, 'infarto') || has(text, 'avc') || has(text, 'deterioracao'))) ||
    (has(text, 'condicao') && has(text, 'passageiro') && (has(text, 'piorar') || has(text, 'agravar'))) ||
    (has(text, 'paciente') && (has(text, 'agravamento') || has(text, 'emergencia medica'))) ||
    (has(text, 'proteger') && has(text, 'colega')) ||
    (has(text, 'colega') && (has(text, 'risco imediato') || has(text, 'exposicao imediata') || has(text, 'preso em area de risco')))

  if (!directPositive) return false

  const explicitNegative = hasAny(text, [
    'nao havia passageiro em emergencia medica',
    'nao havia passageiro com emergencia medica',
    'nao havia passageiro doente',
    'nao havia emergencia medica',
    'nao havia situacao de risco humano imediato',
    'nao havia risco humano imediato',
    'sem situacao de risco humano imediato',
    'sem risco humano imediato',
    'atendimento eletivo',
    'ferramenta improvisada',
    'pressao de prazo',
    'para manter o prazo',
    'janela de parada',
  ])

  return !explicitNegative
}

function hasExplicitRoutineNormalization(text: string): boolean {
  const directPositive = hasAny(text, [
    'pratica tolerada',
    'pratica ja era tolerada',
    'pratica normalizada',
    'pratica normalizada entre as tripulacoes',
    'pratica aceita',
    'pratica comum na equipe',
    'todos faziam assim',
    'todos na oficina faziam assim',
    'sempre fazemos assim',
    'sempre fazia assim',
    'rotina informal',
    'cultura informal',
    'atalho aceito informalmente',
    'desvio normalizado',
    'violacao rotineira',
    'considerado burocracia',
    'burocracia na empresa',
    'burocracia pela empresa',
    'burocracia pela equipe',
    'formalidade dispensavel',
    'todo mundo usa',
    'nunca ninguem foi cobrado',
    'rota habitual',
    'rota conhecida',
    'rota costumeira',
    'por habito',
    'pratica habitual',
    'habito estabelecido',
    'era rotineira',
    'rotineiramente',
    'vinha sendo feito',
    'recorrente',
    'cultura local',
    'atalhos habituais',
    'todos operavam assim',
    'violacao normalizada',
    'tolerado pela organizacao',
  ]) ||
    (has(text, 'altitude minima') && has(text, 'rota') && has(text, 'ganhar tempo'))

  if (!directPositive) return false

  const explicitNegative = hasAny(text, [
    'nao havia historico de pratica similar',
    'nao havia cultura informal',
    'nao tinha historico de simplificar procedimentos',
    'nao tinha historico estabelecido',
    'nao havia historico estabelecido',
    'decisao pontual',
    'decisao individual',
  ])

  return !explicitNegative
}

function hasExplicitEfficiencyObjective(text: string): boolean {
  return hasAny(text, [
    'reduzir consumo de combustivel',
    'economizar combustivel',
    'economia de combustivel',
    'rota mais curta',
    'rota operacional mais curta',
    'cumprir janela de conexao',
    'janela de conexao',
    'perder a janela',
    'cumprir horario',
    'aumentar produtividade',
    'aumentar a produtividade',
    'produtividade',
    'metodo mais rapido',
    'mais rapido',
    'reduzir tempo',
    'reduzir tempo de voo',
    'ganho operacional',
    'eficiencia operacional',
    'eficiencia',
    'pressao comercial',
    'pressao operacional',
    'pressao de producao',
    'economia operacional',
    'impacto comercial',
    'pontualidade',
    'manter a pontualidade',
    'cumprimento do horario',
    'cumprimento do horario publicado',
    'priorizou o cumprimento do horario',
    'priorizou cumprimento do horario',
    'para evitar cancelamento',
    'manter operacao',
    'manter a operacao',
    'continuidade do servico',
    'continuidade da operacao',
    'apesar do minimo',
    'apesar do requisito',
    'mesmo ciente',
    'aceitou liberar',
    'decidiu manter',
    'atalho operacional',
    'avaliou o risco como aceitavel',
  ])
}

function hasExplicitFormalObjectiveViolation(text: string): boolean {
  const rule = hasAny(text, ['regra', 'procedimento', 'protocolo', 'sop', 'norma', 'autorizacao exigida'])
  const deviation = hasAny(text, ['violo', 'violad', 'descumpr', 'nao cumpr', 'nao seguiu', 'ignor', 'desvi'])
  return rule && deviation
}

function hasExplicitConsciousMinimumOrRuleDeviation(text: string): boolean {
  const awareness = hasAny(text, [
    'consciencia explicita',
    'consciencia de que',
    'consciente de que',
    'ciente de que',
    'ciente dos limites',
    'sabia que estava abaixo',
    'sabia que estava abaixo do minimo',
    'sabia que estava abaixo dos minimos',
    'sabia que havia cruzado',
    'aware of',
    'aware that',
    'knowingly',
    'knew that',
    'explicit awareness',
  ])

  const ruleOrLimit = hasAny(text, [
    'minimos meteorologicos',
    'minimo meteorologico',
    'abaixo do minimo',
    'abaixo dos minimos',
    'limite de visibilidade',
    'limites de visibilidade',
    'limite de teto',
    'limites minimos',
    'regra',
    'procedimento',
    'protocolo',
    'sop',
    'minimums',
    'below minimums',
    'below minimum',
    'visibility minimum',
    'ceiling minimum',
    'rule limit',
    'procedure limit',
  ])

  const deviation = hasAny(text, [
    'ultrapassad',
    'cruzou',
    'violou',
    'descumpr',
    'crossed',
    'beyond limit',
    'violated',
  ])

  const continued = hasAny(text, [
    'continuou',
    'prosseguiu',
    'manteve',
    'decidiu prosseguir',
    'manteve a aproximacao',
    'continued',
    'proceeded',
    'kept going',
  ])

  const nonRoutine = hasAny(text, [
    'violacao excepcional',
    'violacao isolada',
    'desvio excepcional',
    'desvio isolado',
    'decisao pontual',
    'caso isolado',
    'nao era rotineiro',
    'nao era habitual',
    'nao rotineir',
    'nao habitual',
    'fora do habitual',
    'fora da rotina',
  ])

  return awareness && ruleOrLimit && deviation && continued && nonRoutine
}

export function classifyObjectiveByRules(text: string): ObjectiveOverrideResult {
  const t = normalizeObjectiveText(text)

  if (hasExplicitRoutineNormalization(t)) {
    return {
      code: 'O-B',
      reason: 'routine or normalized violation',
    }
  }

  if (hasExplicitConsciousMinimumOrRuleDeviation(t)) {
    return {
      code: 'O-C',
      reason: hasExplicitProtectiveHumanIntent(t)
        ? 'explicit awareness of known limit/rule deviation with continued operation; protective intent is motive only'
        : 'explicit awareness of known limit/rule deviation with continued operation',
    }
  }

  if (hasExplicitEfficiencyObjective(t) && !hasExplicitFormalObjectiveViolation(t)) {
    return {
      code: 'O-D',
      reason: 'efficiency, economy, time, connection, fuel, or productivity objective',
    }
  }

  return {
    code: null,
    reason: 'no strong deterministic objective rule matched',
  }
}
