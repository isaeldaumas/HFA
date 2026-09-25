import type { SeraAssertionStatus, SeraEvidenceSourceSection } from '../engine-contract'

export const OUTCOME_KEYWORDS = [
  'crash',
  'impact',
  'collision',
  'injury',
  'fatal',
  'damage',
  'ditch',
  'fell',
  'hit',
  'strike',
  'acidente',
  'impacto',
  'colisão',
  'colisao',
  'ferido',
  'fatal',
  'dano',
  'queda',
  'bateu',
]

type ExtractedFactCategory = 'actor' | 'action' | 'condition' | 'environment' | 'timeline' | 'outcome' | 'other'

type SourceSentence = {
  statement: string
  sourceSentenceIndex: number
  sourceSection: SeraEvidenceSourceSection
  assertionStatus: SeraAssertionStatus
}

type ExtractedFact = SourceSentence & { category: ExtractedFactCategory }

type ExtractedTimelineItem = SourceSentence & {
  order: number
  temporalCue: string | null
}

const TEMPORAL_CUES = [
  'before',
  'after',
  'during',
  'then',
  'when',
  'while',
  'antes',
  'depois',
  'durante',
  'então',
  'entao',
  'quando',
  'enquanto',
]

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function detectSection(line: string, current: SeraEvidenceSourceSection): SeraEvidenceSourceSection {
  const text = normalize(line)
  if (/^(?:\d+(?:\.\d+)*\s*)?(recomendacoes?|recomendacoes de seguranca operacional|safety recommendations?|acoes? corretivas?|acoes? preventivas?|licoes? aprendidas?)/.test(text)) return 'RECOMMENDATION'
  if (/^(?:\d+(?:\.\d+)*\s*)?(informacoes? factuais?|informacoes? sobre o evento|historico|aeronave|tripulacao|relatos?\/registros?|relato do|relato da|entrevista|transcricao)/.test(text)) return 'FACTUAL'
  if (/^(?:\d+(?:\.\d+)*\s*)?(conclusao|fatores? contribuintes?|atos? ou condicoes? inseguras?|fatores? de supervisao|influencias? organizacionais?|gerenciamento das barreiras|falha na gestao|analise do evento)/.test(text)) return 'REPORT_ANALYSIS'
  if (/^(?:\d+(?:\.\d+)*\s*)?(objetivo da investigacao|composicao da comissao|classificacao do evento|classificacao do risco|experiencia do|horas totais|validade do|dados da aeronave)/.test(text)) return 'ADMINISTRATIVE'
  return current
}

function assertionStatus(statement: string): SeraAssertionStatus {
  const text = normalize(statement)
  if (/\b(nao interferiu|nao contribuiu|nao observado|nao observada|nao evidenciado|nao evidenciada|sem evidencia|foi descartad[oa]|fator descartad[oa]|nao aplicavel)\b/.test(text)) return 'REJECTED_AS_FACTOR'
  if (/\b(ficaram muito focados|estavam muito focados|estava muito focado|estavam focados|estava focado|concentrados? em)\b/.test(text)) return 'AFFIRMED'
  if (/\b(manual|procedimento|regra|norma|regulamento|sop|procedure|rule|regulation|manual)\b.*\b(poderia|deveria|devia|exigia|estabelecia|determinava|required|mandated|stated|specified|could not|must not)\b/.test(text)) return 'AFFIRMED'
  if (/\b(poderia|pode ter|podem ter|supostamente|possivelmente|talvez|hipotese|hipoteticamente|sugere-se|sugere que|pode ter sido)\b/.test(text)) return 'UNCERTAIN'
  return 'AFFIRMED'
}

function classifyFactCategory(sentence: string): ExtractedFactCategory {
  const text = sentence.toLowerCase()
  if (/\b(crew|pilot|captain|first officer|operator|maintenance|controller|tripula|comandante|copiloto|piloto)\b/.test(text)) return 'actor'
  if (/\b(before|after|during|then|when|while|antes|depois|durante|ent[aã]o|quando|enquanto)\b/.test(text)) return 'timeline'
  if (/\b(cloud|visibility|weather|wind|rain|fog|night|wx|nuvem|visibilidade|tempo|chuva|nevoeiro|vento|meteorolog)\b/.test(text)) return 'environment'
  if (/\b(alert|warning|system|failure|fault|degraded|condition|unsafe|alerta|falha|condi[cç][aã]o|degradad)\b/.test(text)) return 'condition'
  if (/\b(crash|impact|collision|injury|fatal|damage|acidente|impacto|colis[aã]o|ferid|fatal|dano)\b/.test(text)) return 'outcome'
  if (/\b(did|failed|continued|descended|climbed|turned|landed|executed|applied|fez|falhou|continuou|desceu|subiu|virou|pousou|pouso|executou|aplicou|inseriu|programou|selecionou|ajustou|configurou|acionou|digitou|identificou|confundiu|associou|prosseguiu|aproximou)\b/.test(text)) return 'action'
  return 'other'
}

function extractTemporalCue(sentence: string): string | null {
  const lower = sentence.toLowerCase()
  return TEMPORAL_CUES.find((cue) => lower.includes(cue)) ?? null
}

function isPageBoilerplate(line: string): boolean {
  const text = normalize(line)
  return /^form-sso-/.test(text) || /^investigacao de ocorrencia p\. \d+/.test(text)
}

function isStructuralHeading(line: string): boolean {
  const text = normalize(line)
  if (/^\d+(?:\.\d+)+\s+[a-z]/.test(text)) return true
  return /^(entrevista com|transcricao do relato|experiencia do|elaborado por:|validado por:)/.test(text)
}

function startsListItem(line: string): boolean {
  return /^(?:[0-9]+\.|[a-z]\)|[•▪-])\s*/i.test(line.trim())
}

function endsLogicalUnit(line: string): boolean {
  return /[.!?;:”“"]$/.test(line.trim())
}

function reflowNarrativeLines(input: string): string[] {
  const out: string[] = []
  let buffer = ''

  const flush = () => {
    const value = buffer.replace(/\s+/g, ' ').trim()
    if (value) out.push(value)
    buffer = ''
  }

  for (const raw of input.split(/\n+/)) {
    const line = raw.trim()
    if (!line || isPageBoilerplate(line)) continue

    if (isStructuralHeading(line)) {
      flush()
      out.push(line)
      continue
    }

    if (startsListItem(line)) {
      flush()
      buffer = line
      if (endsLogicalUnit(line)) flush()
      continue
    }

    // Investigation-factor lists often end an item with a classification such as
    // “Não interferiu” without punctuation. Do not glue the following causal sentence
    // to that rejected factor, otherwise opposite evidence polarities are collapsed.
    if (buffer && startsListItem(buffer) && /(?:n[aã]o interferiu|n[aã]o contribuiu|contribuiu|n[aã]o aplic[aá]vel|n[aã]o observado|n[aã]o evidenciado)\s*$/i.test(buffer)) {
      flush()
    }
    buffer = buffer ? `${buffer} ${line}` : line
    if (endsLogicalUnit(line)) flush()
  }
  flush()
  return out
}

function splitCompoundTemporalBoundary(statement: string): string[] {
  const patterns = [
    /\s+(?=until\s+(?:the\s+)?(?:impact|collision|crash|terrain contact))/i,
    /\s+(?=at[eé]\s+(?:o\s+|a\s+)?(?:impacto|colis[aã]o|acidente|contato com o terreno))/i,
    /\s+(?=(?:and\s+)?(?:only\s+)?later\s+(?:did\s+)?(?:the\s+)?(?:aircraft\s+)?(?:impact|strike|crash|ditch|ditched|executed a ditching))/i,
    /\s+(?=(?:e\s+)?(?:somente\s+)?(?:mais tarde|depois|posteriormente)\s+(?:a\s+aeronave\s+)?(?:impactou|colidiu|caiu|amerissou))/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(statement)
    if (!match || match.index <= 0) continue
    const first = statement.slice(0, match.index).trim().replace(/[;,]+$/g, '')
    const second = statement.slice(match.index).trim()
    if (first && second) return [first, second]
  }
  return [statement]
}

function isPureHeading(statement: string): boolean {
  const text = normalize(statement)
  return /^(investigacao de ocorrencia|relatorio de investigacao de ocorrencia|form-sso-|\d+(?:\.\d+)+\s+[a-z]|entrevista com|transcricao do relato|experiencia do)/.test(text)
}

export function splitNarrativeIntoSentenceRecords(input: string): SourceSentence[] {
  const records: SourceSentence[] = []
  let currentSection: SeraEvidenceSourceSection = 'UNKNOWN'
  let sourceSentenceIndex = 0

  for (const logicalLine of reflowNarrativeLines(input)) {
    currentSection = detectSection(logicalLine, currentSection)
    const statements = logicalLine
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .flatMap(splitCompoundTemporalBoundary)
    for (const statement of statements) {
      if (isPureHeading(statement)) continue
      records.push({
        statement,
        sourceSentenceIndex: sourceSentenceIndex++,
        sourceSection: currentSection,
        assertionStatus: assertionStatus(statement),
      })
      if (records.length >= 800) return records
    }
  }

  return records
}

export function splitNarrativeIntoSentences(input: string): string[] {
  return splitNarrativeIntoSentenceRecords(input).map((item) => item.statement)
}

export function extractCandidateFacts(input: string): {
  facts: ExtractedFact[]
  sentences: string[]
} {
  const records = splitNarrativeIntoSentenceRecords(input)
  const facts = records.map((record) => ({
    ...record,
    category: classifyFactCategory(record.statement),
  }))
  return { facts, sentences: records.map((item) => item.statement) }
}

export function buildCandidateTimeline(sentences: string[], input?: string): ExtractedTimelineItem[] {
  const records = input
    ? splitNarrativeIntoSentenceRecords(input)
    : sentences.map((statement, sourceSentenceIndex) => ({
        statement,
        sourceSentenceIndex,
        sourceSection: 'UNKNOWN' as SeraEvidenceSourceSection,
        assertionStatus: assertionStatus(statement),
      }))

  return records.map((record, index) => ({
    ...record,
    order: index + 1,
    temporalCue: extractTemporalCue(record.statement),
  }))
}
