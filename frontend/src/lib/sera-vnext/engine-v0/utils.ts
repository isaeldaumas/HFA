import { buildPassiveEvidenceCategoryHints } from '../evidence-categories'
import { excludedPostEscapeEvidenceFromTimeline } from '../evidence/temporal-scope'
import type {
  SeraConfidence,
  SeraFact,
  SeraPreconditionCategory,
  SeraTimelineItem,
  SeraVNextEngineInput,
} from '../engine-contract'

export function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function hasAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern.toLowerCase()))
}

export function pushUnique(target: string[], value: string): void {
  if (value.trim().length === 0) return
  if (!target.includes(value)) target.push(value)
}

export function confidenceFromCount(size: number): SeraConfidence {
  if (size >= 3) return 'HIGH'
  if (size === 2) return 'MEDIUM'
  return 'LOW'
}

export function summarizeInput(input: SeraVNextEngineInput): string {
  return input.narrative.replace(/\s+/g, ' ').trim().slice(0, 280)
}

export function buildEvidenceTrace(facts: SeraFact[], usage: Record<string, string[]>): Array<{
  evidenceId: string
  statement: string
  category: SeraFact['category']
  sourceSentenceIndex: number
  usedBy: string[]
}> {
  return facts.map((fact) => ({
    evidenceId: fact.id,
    statement: fact.statement,
    category: fact.category,
    sourceSentenceIndex: fact.sourceSentenceIndex,
    usedBy: usage[fact.id] || [],
  }))
}

export function classifyPreconditionCategory(args: {
  text: string
  proposedCode: string | null
}): SeraPreconditionCategory | null {
  const normalized = args.text.toLowerCase()
  const mapped = args.proposedCode
    ? buildPassiveEvidenceCategoryHints({ releasedCode: args.proposedCode, evidenceRefs: [args.text] })[0]?.category
    : undefined

  const explicitMap: Array<[SeraPreconditionCategory, string[]]> = [
    ['SENSORY_LIMITATION', ['visibility', 'fog', 'night', 'sensory', 'low cloud', 'visual references']],
    ['KNOWLEDGE_TRAINING', ['training gap', 'knowledge gap', 'competence gap', 'lack of training', 'lack of knowledge', 'insufficient training', 'not trained', 'unfamiliarity', 'lacuna de treinamento', 'lacuna de conhecimento', 'falta de treinamento', 'falta de conhecimento', 'treinamento insuficiente', 'não treinado', 'nao treinado', 'não familiar', 'nao familiar']],
    ['TIME_PRESSURE', ['time pressure', 'rushed', 'late decision', 'very late', 'pressão de tempo', 'apressado']],
    ['ATTENTION_WORKLOAD_CONTEXT', ['visão de túnel', 'visao de tunel', 'distração', 'distracao', 'muito focados', 'muito focado', 'carga de trabalho', 'fixação', 'fixacao', 'atenção desviada', 'atencao desviada']],
    ['COMMUNICATION_INFORMATION', ['communication', 'readback', 'briefing', 'callout']],
    ['PROCEDURAL_MONITORING', ['monitoring', 'cross-check', 'procedure', 'verification', 'reconfirmação', 'reconfirmacao', 'código 9p', 'codigo 9p', 'distração', 'distracao', 'visão de túnel', 'visao de tunel', 'focado', 'focada', 'atenção', 'atencao']],
    ['FEEDBACK_VERIFICATION', ['feedback', 'verify', 'verification']],
    ['INTENT_AWARENESS', ['intent', 'conscious', 'knowingly', 'decided', 'decision', 'start the crank']],
    ['ENVIRONMENTAL_CONTEXT', ['weather', 'wind', 'rain', 'runway condition', 'terrain', 'vento', 'condições meteorológicas', 'condicoes meteorologicas', 'severe icing', 'sev ice', 'formação de gelo', 'formacao de gelo', 'icing', 'gelo', 'proximidade', 'distância entre', 'distancia entre']],
    ['TEAM_COORDINATION', ['crew coordination', 'team coordination', 'coordenação da tripulação', 'coordenacao da tripulacao', 'crm', 'falha de coordenação', 'falha de coordenacao']],
    ['ORGANIZATIONAL_CONTEXT', ['schedule', 'organizational', 'dispatch', 'operator pressure', 'reduced staffing', 'degraded supervision', 'staffing', 'supervision', 'supervisão', 'supervisao', 'supervisão inadequada', 'supervisao inadequada', 'cultura', 'culture', 'registro formal', 'formal record', 'tlb']],
    ['TECHNICAL_CONTEXT', ['warning', 'system', 'automation', 'fmc', 'equipment', 'control law', 'autothrottle', 'dafcs', 'trim fail', 'rudder', 'technical', 'malfunction', 'fault', 'pane', 'falha técnica', 'falha tecnica']],
    ['PHYSICAL_CAPABILITY', ['physical', 'fatigue', 'ergonomic', 'motor', 'reach']],
  ]

  const containsToken = (token: string): boolean => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9À-ÿ])${escaped}([^a-z0-9À-ÿ]|$)`, 'i').test(normalized)
  }
  const explicitOperationalTimePressure =
    /\b(time pressure|rushed sequence|schedule pressure|slot pressure|tight schedule|press[aã]o de tempo|sequ[eê]ncia apressada|press[aã]o de escala|correria|behind schedule|running late)\b/i.test(args.text) ||
    /\b(urgency|urgent|urg[eê]ncia|urgente)\b.*\b(time|deadline|window|schedule|decision|action|execute|respond|tempo|prazo|janela|hor[aá]rio|decis[aã]o|agir|executar|responder)\b/i.test(args.text)

  const spatialEnvironmentContext =
    /\bproximidade\s+entre\b/i.test(args.text) ||
    /\b(?:unidades?|plataformas?|pistas?|destinos?|aer[oó]dromos?|helipontos?)\b.{0,100}\b(?:pr[oó]xim[oa]s?|adjacent|nearby)\b/i.test(args.text) ||
    /\b(?:pr[oó]xim[oa]s?|adjacent|nearby)\b.{0,100}\b(?:unidades?|plataformas?|pistas?|destinos?|aer[oó]dromos?|helipontos?)\b/i.test(args.text)
  if (spatialEnvironmentContext) return 'ENVIRONMENTAL_CONTEXT'

  const technicalFailure =
    /\b(fault|malfunction|pane|de-icing|airframe|technical failure|falha t[eé]cnica)\b/i.test(args.text) ||
    (/\b(failure|falha)\b/i.test(args.text) && /\b(system|sistema|equipment|equipamento|sensor|display|automation|automacao|motor|engine|hydraulic|hidraul|electrical|eletric|de-icing|airframe|fmc|dafcs|rudder|trim)\b/i.test(args.text))
  if (technicalFailure && !/\b(weather|meteorolog|condi[cç][oõ]es? meteorol[oó]gicas|severe icing|sev ice)\b/i.test(args.text)) {
    return 'TECHNICAL_CONTEXT'
  }

  for (const [category, tokens] of explicitMap) {
    if (category === 'TIME_PRESSURE' && !explicitOperationalTimePressure) continue
    if (tokens.some(containsToken)) return category
  }

  return (mapped as SeraPreconditionCategory | undefined) || null
}

export function excludedPostEscapeEvidence(timeline: SeraTimelineItem[], latestSourceSentenceIndex: number | null, escapePointStatement?: string | null): string[] {
  return excludedPostEscapeEvidenceFromTimeline(timeline, latestSourceSentenceIndex, escapePointStatement)
}
