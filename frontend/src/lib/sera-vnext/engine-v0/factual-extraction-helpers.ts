import type { SeraAssertionStatus, SeraEvidenceSourceSection, SeraOccurrenceScope } from '../engine-contract'

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
  occurrenceScope: SeraOccurrenceScope
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

export function isNonCausalDocumentStatement(statement: string): boolean {
  const text = normalize(statement)
  if (!text) return true
  if (/^(comando da aeronautica|centro de investigacao e prevencao de acidentes aeronauticos|relatorio final|advertencia|glossario|sumario|indice)\b/.test(text) || /^fonte\s*:/.test(text) || /^figura\s+\d+\b/.test(text)) return true
  if (/^\d+\s+de\s+\d+\b/.test(text) || /\.{5,}/.test(statement)) return true
  if (/\bobjetivo unico deste trabalho\b|\bcompete ao sistema de investigacao e prevencao de acidentes aeronauticos\b|\bnao e foco da investigacao sipaer\b/.test(text)) return true
  if (/\beste relatorio final foi disponibilizado\b|\bpresidente, diretor, chefe\b.*\bprovidencias\b/.test(text)) return true
  const acronymCount = (statement.match(/\b[A-Z][A-Z0-9-]{1,8}\b/g) ?? []).length
  return acronymCount >= 7 && !/\b(decidiu|continuou|prosseguiu|executou|falhou|detectou|ativou|desligou|ligou|verbalizou|informou|observou)\b/i.test(statement)
}

export function isProcedureReferenceStatement(statement: string): boolean {
  const text = normalize(statement)
  const source = /\b(fcom|qrh|afm|mel|manual|procedimento|procedure|checklist|regulamento|norma)\b/.test(text)
  const normative = /\b(estabelecia|determinava|previa|exigia|requeria|deveria|devia|era necessario|era obrigatorio|required|mandated|specified|stated|should|must)\b/.test(text)
  const occurred = /\b(nao executou|nao realizou|deixou de|falhou em|executou|realizou|cumpriu|descumpriu|foi executado|foi realizado|nao foi executad[oa]|nao foi realizad[oa]|nao foram executad[oa]s|nao foram realizad[oa]s|nao foram cumprid[oa]s|were not executed|were not performed|was not executed|was not performed)\b/.test(text)
  const actorAwareness = /\b(captain|first officer|pilot|crew|comandante|copiloto|piloto|tripulacao)\b.*\b(said|stated|knew|was aware|recognized|noted|commented|disse|afirmou|sabia|conhecia|ciente|reconheceu|comentou)\b/.test(text)
  return source && normative && !occurred && !actorAwareness
}

export function isSystemDescriptionStatement(statement: string): boolean {
  const text = normalize(statement)
  if (isNonCausalDocumentStatement(statement)) return false
  const definition = /\b(era responsavel|tinha a funcao|era composto|era constituido|possuia|permitia|armava|ativava|correspondia|provia|indicava|apresentava|fornecia|servia para|ficava localizado|rotacionava livremente|poderia prover|poderia ser|deveria ser testado)\b/.test(text)
  const technicalSubject = /\b(sistema|modo|painel|luz|alerta|sensor|apm|afcs|ccas|sps|autopilot|piloto automatico|de-icing|anti-icing|stick pusher|stick shaker|approach \(app|app - aproximacao)\b/.test(text)
  const eventAnchor = /\b(as \d{1,2}h\d{2}|\d{1,2}:\d{2}|durante o voo|naquele voo|no voo do acidente|a tripulacao|o comandante|o copiloto|o pic|o sic)\b/.test(text)
  return definition && technicalSubject && !eventAnchor
}

export function isExplicitOperationalOmissionStatement(statement: string): boolean {
  const text = normalize(statement)
  return /\b(procedimentos?|checklists?|acoes?|itens?|steps?|procedures?)\b.*\b(nao (?:foi|foram) (?:executad[oa]s?|realizad[oa]s?|cumprid[oa]s?|aplicad[oa]s?)|were not (?:executed|performed|completed|followed)|was not (?:executed|performed|completed|followed))\b/.test(text)
    || /\b(nao executou|nao realizou|nao cumpriu|deixou de executar|deixou de realizar|failed to execute|failed to perform|did not execute|did not perform)\b/.test(text)
}

export function isExplicitOperationalDeviationStatement(statement: string): boolean {
  const text = normalize(statement)
  return /\b(aeronave|aircraft)\b.*\b(foi despachad[ao]|was dispatched)\b.*\b(sem|without|apesar|despite)\b.*\b(mel|restri[cç][oõ]es?|restriction|falha|fault|pane)\b/.test(text)
    || /\b(condi[cç][oõ]es?|weather|meteorolog)\b.*\b(nao foram avaliadas adequadamente|n[aã]o foram avaliadas adequadamente|were not adequately assessed)\b.*\b(cco|dov|pic|dispatch|dispatcher|pilot)\b/.test(text)
    || /\b(manteve|mantiveram|permaneceu|permaneceram|continued|remained)\b.*\b(condi[cç][aã]o|gelo|icing|falha|fault|degradad|unsafe|insegur)\b/.test(text)
}

export function isOperationalEventStatement(statement: string): boolean {
  if (isNonCausalDocumentStatement(statement) || isProcedureReferenceStatement(statement) || isSystemDescriptionStatement(statement)) return false
  if (isExplicitOperationalOmissionStatement(statement) || isExplicitOperationalDeviationStatement(statement)) return true
  const text = normalize(statement)
  const actorAction = /\b(tripulacao|comandante|copiloto|pic|sic|piloto|pilot|crew|captain|first officer|eles|they|maintenance|manutencao|despachante|dov|cco)\b.*\b(decidiu|decidiram|continuou|continuaram|prosseguiu|prosseguiram|manteve|mantiveram|selecionou|acionou|desligou|ligou|executou|omitiu|deixou de|falhou|iniciou|iniciado|iniciada|inseriu|programou|ajustou|configurou|verbalizou|informou|comentou|observou|notou|percebeu|reconheceu|processou|perdeu|interpretou|interpretaram|identificou|identificaram|confundiu|confundiram|associou|associaram|tratou|trataram|conduziu|conduziram|preparou|prepararam|passou|passaram|tomou|tomaram|hesitou|hesitaram|demorou|demoraram|esperou|esperaram|desceu|desceram|subiu|subiram|moveu|moveram|alinhou|alinharam|permitiu|permitiram|continued|decided|selected|executed|failed to|did not|descended|climbed|moved|lined up|allowed|initiated|started|inserted|programmed|configured|noticed|perceived|recognized|processed|lost|interpreted|identified|misidentified|mistook|treated|conducted|prepared|proceeded|treated|hesitated|delayed|waited)\b/.test(text)
  const eventTime = /\b(as \d{1,2}h\d{2}|\d{1,2}:\d{2}|apos|depois|durante o voo|durante a aproximacao|durante a descida|em seguida|logo apos|na sequencia|when|after|during the flight|during approach|during descent|then)\b/.test(text)
  const eventVerb = /\b(foi apresentada|foi detectad|detectou|atingiu|reduziu|aumentou|entrou em|recebeu|apresentou|ocorreu|ativou|desativou|reconheceu|desceu|descendeu|permaneceu|alinhou|pousou|identified|detected|received|entered|activated|descended|remained|lined up|landed)\b/.test(text)
  const preflight = /\b(inspecao (?:de )?pre[- ]?voo|preflight inspection|inspecao visual|visual inspection)\b.*\b(concluida|completed|nao detectou|nada de anormal|nenhuma anormalidade|fora detectad[oa]|no abnormality|nothing abnormal|had been detected)\b/.test(text)
  const preflightRelease = /\b(aeronave|aircraft|inspecao|inspection)\b.*\b(pre[- ]?voo|preflight)\b.*\b(liberad[ao]|released|considerada apta|considered fit|sem travamento|not secured|unlatched|latches?|fechos?)\b/.test(text)
    || /\b(pre[- ]?voo|preflight)\b.*\b(aeronave|aircraft)\b.*\b(liberad[ao]|released|considerada apta|considered fit)\b/.test(text)
  return actorAction || preflight || preflightRelease || (eventTime && eventVerb)
}

function detectSection(line: string, current: SeraEvidenceSourceSection): SeraEvidenceSourceSection {
  const text = normalize(line)
  const sectionPrefix = /^(?:\d+(?:\.\d+)*\.?\s*)?/
  const body = text.replace(sectionPrefix, '')
  if (/^(recomendacoes?|recomendacoes de seguranca operacional|safety recommendations?|acoes? corretivas?|acoes? preventivas?|licoes? aprendidas?)/.test(body)) return 'RECOMMENDATION'
  // A report may enter a conclusions section and then explicitly reopen a factual subsection
  // (for example, "3.1. Fatos"). That subsection must regain factual provenance.
  if (/^(fatos(?:\s|$)|sumario|sinopse|informacoes? factuais?|informacoes? sobre o evento|historico|aeronave|tripulacao|relatos?\/registros?|relato do|relato da|entrevista|transcricao)/.test(body)) return 'FACTUAL'
  if (/^(conclusao|fatores? contribuintes?|atos? ou condicoes? inseguras?|fatores? de supervisao|influencias? organizacionais?|gerenciamento das barreiras|falha na gestao|analise do evento)/.test(body)) return 'REPORT_ANALYSIS'
  if (/^(objetivo da investigacao|composicao da comissao|classificacao do evento|classificacao do risco|experiencia do|horas totais|validade do|dados da aeronave|advertencia|glossario|indice)/.test(body)) return 'ADMINISTRATIVE'
  return current
}

function detectOccurrenceScope(line: string, current: SeraOccurrenceScope): SeraOccurrenceScope {
  const text = normalize(line)
  if (/\b(voo do acidente|accident flight|flight of the accident)\b/.test(text)) return 'CURRENT_EVENT'
  if (/\b(voo\s*[-–—]?\s*[123]\b|flight\s*[-–—]?\s*[123]\b|casos especificos com aeronaves da frota|outros? voos? da frota|em outro voo|another flight)\b/.test(text)) return 'HISTORICAL_COMPARATOR'
  const body = text.replace(/^(?:\d+(?:\.\d+)*\.?\s*)?/, '')
  if (/^fatos(?:\s|$)/.test(body)) return 'CURRENT_EVENT'
  if (/^(descricao do sistema|system description|manual|procedimentos?|procedure|informacoes meteorologicas gerais|general information)/.test(body)) return 'GENERAL_CONTEXT'
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
  if (/\b(cloud|visibility|weather|wind|rain|fog|night|wx|nuvem|visibilidade|tempo|chuva|nevoeiro|vento|meteorolog\w*|icing|gelo|sev ice|severe icing)\b/.test(text)) return 'environment'
  if (/\b(alert|warning|system|failure|fault|degraded|condition|unsafe|alerta|falha|condi[cç][aã]o|degradad)\b/.test(text)) return 'condition'
  if (/\b(crash|impact|collision|injury|fatal|damage|acidente|impacto|colis[aã]o|ferid|fatal|dano)\b/.test(text)) return 'outcome'
  if (/\b(did|failed|continued|descended|climbed|turned|landed|executed|applied|fez|falhou|continuou|desceu|subiu|virou|pousou|pouso|executou|aplicou|inseriu|programou|selecionou|ajustou|configurou|acionou|digitou|identificou|confundiu|associou|prosseguiu|aproximou|nao foram executad|nao foram realizad|nao foi executad|nao foi realizad|foi despachad)\b/.test(text)) return 'action'
  return 'other'
}

function extractTemporalCue(sentence: string): string | null {
  const lower = sentence.toLowerCase()
  return TEMPORAL_CUES.find((cue) => lower.includes(cue)) ?? null
}

function isPageBoilerplate(line: string): boolean {
  const text = normalize(line)
  return /^form-sso-/.test(text)
    || /^investigacao de ocorrencia p\. \d+/.test(text)
    || /^\d+\s+de\s+\d+\b/.test(text)
    || /^(?:a-?\d+\/cenipa\/\d+|ps-[a-z0-9]+\s+\d{2}[a-z]{3}\d{4})\b/.test(text)
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
  return /^(investigacao de ocorrencia|relatorio de investigacao de ocorrencia|form-sso-|\d+(?:\.\d+)+\.?\s+[a-z]|entrevista com|transcricao do relato|experiencia do)/.test(text)
}

const MAX_SENTENCE_RECORDS = 1000
const HEAD_RECORD_BUDGET = 180
const TAIL_RECORD_BUDGET = 320

function boundedSentenceRecords(records: SourceSentence[]): SourceSentence[] {
  if (records.length <= MAX_SENTENCE_RECORDS) return records

  const ranked = records.map((record, index) => {
    let priority = 0
    if (isExplicitOperationalDeviationStatement(record.statement) || isExplicitOperationalOmissionStatement(record.statement)) priority = 100
    else if (record.occurrenceScope === 'CURRENT_EVENT' && isOperationalEventStatement(record.statement)) priority = 90
    else if (record.sourceSection === 'FACTUAL' && isOperationalEventStatement(record.statement)) priority = 80
    else if (record.sourceSection === 'FACTUAL' && record.occurrenceScope === 'CURRENT_EVENT') priority = 50
    return { index, priority }
  })

  const selected = new Set<number>()
  for (let index = 0; index < Math.min(HEAD_RECORD_BUDGET, records.length); index += 1) selected.add(index)
  for (let index = Math.max(0, records.length - TAIL_RECORD_BUDGET); index < records.length; index += 1) selected.add(index)

  for (const candidate of ranked.sort((a, b) => b.priority - a.priority || a.index - b.index)) {
    if (candidate.priority <= 0 || selected.size >= MAX_SENTENCE_RECORDS) break
    selected.add(candidate.index)
  }

  if (selected.size < MAX_SENTENCE_RECORDS) {
    const remaining = MAX_SENTENCE_RECORDS - selected.size
    const stride = Math.max(1, Math.floor(records.length / remaining))
    for (let index = 0; index < records.length && selected.size < MAX_SENTENCE_RECORDS; index += stride) selected.add(index)
  }

  return [...selected].sort((a, b) => a - b).map((index) => records[index])
}

export function splitNarrativeIntoSentenceRecords(input: string): SourceSentence[] {
  const records: SourceSentence[] = []
  let currentSection: SeraEvidenceSourceSection = 'UNKNOWN'
  let currentOccurrenceScope: SeraOccurrenceScope = 'UNKNOWN'
  let sourceSentenceIndex = 0

  for (const logicalLine of reflowNarrativeLines(input)) {
    currentSection = detectSection(logicalLine, currentSection)
    currentOccurrenceScope = detectOccurrenceScope(logicalLine, currentOccurrenceScope)
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
        occurrenceScope: currentOccurrenceScope,
      })
    }
  }

  return boundedSentenceRecords(records)
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
        occurrenceScope: 'UNKNOWN' as SeraOccurrenceScope,
      }))

  return records.map((record, index) => ({
    ...record,
    order: index + 1,
    temporalCue: extractTemporalCue(record.statement),
  }))
}
