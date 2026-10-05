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
  if (/^(comando da aeronautica|centro de investigacao e prevencao de acidentes aeronauticos|relatorio final|a elaboracao deste relatorio final|sinopse(?:\s+o presente relatorio final)?|advertencia|glossario|sumario|indice)\b/.test(text) || /^fonte\s*:/.test(text) || /^figura\s+\d+\b/.test(text)) return true
  if (/^\d+\s+de\s+\d+\b/.test(text) || /\.{5,}/.test(statement)) return true
  if (/\bobjetivo unico deste trabalho\b|\bcompete ao sistema de investigacao e prevencao de acidentes aeronauticos\b|\bnao e foco da investigacao sipaer\b/.test(text)) return true
  if (/\b(?:o |este )?(?:relato|relatorio|documento|registro)\s+(?:nao|não)\s+(?:informa|descreve|esclarece|registra|indica)\b/.test(text)) return true
  if (/\beste relatorio final foi disponibilizado\b|\bpresidente, diretor, chefe\b.*\bprovidencias\b/.test(text)) return true
  const acronymCount = (statement.match(/\b[A-Z][A-Z0-9-]{1,8}\b/g) ?? []).length
  return acronymCount >= 7 && !/\b(decidiu|continuou|prosseguiu|executou|falhou|detectou|ativou|desligou|ligou|verbalizou|informou|observou)\b/i.test(statement)
}

export function isProcedureReferenceStatement(statement: string): boolean {
  const text = normalize(statement)
  const source = /\b(fcom|qrh|afm|mel|manual|procedimento|procedure|checklist|regulamento|norma)\b/.test(text)
  const normative = /\b(estabelecia|determinava|previa|previsto|prevista|exigia|requeria|deveria|devia|poderia|era necessario|era obrigatorio|required|mandated|specified|stated|should|must|could)\b/.test(text)
  const occurred = /\b(nao executou|nao realizou|deixou de|falhou em|executou|realizou|cumpriu|descumpriu|foi executado|foi realizado|nao foi executad[oa]|nao foi realizad[oa]|nao foram executad[oa]s|nao foram realizad[oa]s|nao foram cumprid[oa]s|were not executed|were not performed|was not executed|was not performed)\b/.test(text)
  const actorAwareness = /\b(captain|first officer|pilot|crew|comandante|copiloto|piloto|piloto entrevistado|entrevistado|tripulacao|eles|nos|we|eu|ele)\b.*\b(said|stated|knew|was aware|recognized|noted|commented|explained|reported|disse|afirmou|sabia|conhecia|ciente|reconheceu|comentou|explicou|explica|relatou|informa)\b/.test(text)
  return source && normative && !occurred && !actorAwareness
}

export function isSystemDescriptionStatement(statement: string): boolean {
  const text = normalize(statement)
  if (isNonCausalDocumentStatement(statement)) return false
  const definition = /\b(era responsavel|responsavel por|responsavel pelo|responsaveis|responsaveis por|responsaveis pelo|tinha a funcao|tinha por objetivo|era composto|era constituido|possuia|permitia|armava|ativava|correspondia|provia|proviam|indicava|apresentava|fornecia|servia para|ficava localizado|rotacionava livremente|poderia prover|poderia ser|poderia inibir|poderia realizar|poderia ocorrer|poderia atingir|could be|could inhibit|could perform|could reach|deveria ser testado|deveria ser mantido|deveriam ser mantidos|ficaria acesa|ficariam acesas|ficaria piscando|ficariam piscando|acenderia|acenderiam|era exibido|eram exibidos|era exibida|eram exibidas|comecaria a piscar|comecariam a piscar|atuava|atuavam|funcionava|funcionavam|realizava|realizavam|utilizava|utilizavam|monitorava|monitoravam|emitia|emitiam|compreendia|compreendiam|consistia|consistiam|permanecia|permaneciam|com o objetivo de|era ligado|era desligado|eram ligados|eram desligados)\b/.test(text)
  const technicalSubject = /\b(sistema|sistemas|system|systems|modo|painel|luz|luzes|alerta|aviso|warning|sensor|iep|ice evidence probe|indicador|atuador|actuator|trimagem|trim|desacoplamento|uncoupling|pitch uncoupling|rolamento|roll|profundor|elevator|apm|afcs|ccas|sps|autopilot|piloto automatico|de-icing|anti-icing|boots?|stick pusher|stick shaker|approach \(app|app - aproximacao)\b/.test(text)
  const temporalEventAnchor = /\b(as \d{1,2}h\d{2}|\d{1,2}:\d{2}|naquele voo|no voo do acidente)\b/.test(text) || /^(durante o voo|during the flight)\b/.test(text)
  const actorEventAnchor = /\b(a tripulacao|o comandante|o copiloto|o pic|o sic|o piloto entrevistado|o outro piloto|o outro tripulante|o cara|eu|nos|a gente)\b.{0,140}\b(decidiu|decidi|manteve|mantive|executou|executei|acionou|acionei|desligou|desliguei|ligou|liguei|comentou|comentei|informou|informei|observou|observei|percebeu|percebi|reconheceu|reconheci|falhou|deixou de|deixei de|continuou|continuei|prosseguiu|prossegui|tirou|tirei|retirou|retirei|puxou|puxei|julgou|julguei|preferiu|preferi)\b/.test(text)
  return definition && technicalSubject && !temporalEventAnchor && !actorEventAnchor
}


export function isDirectControlResponseStatement(statement: string): boolean {
  const text = normalize(statement)
  const controlSurface = /\b(coluna(?: de comando)?|manche|comando(?: de arfagem)?|profundor|control column|yoke|stick|cyclic|ciclico|coletivo|collective|pitch control)\b/.test(text)
  const protectiveCue = /\b(stick pusher|stick shaker|stall warning|stall protection|sps|prote[cç][aã]o contra stall|alerta de stall)\b/.test(text)
  const opposingInput = /\b(em oposicao|oposi[cç][aã]o|contrari[ao]|contra a atua[cç][aã]o|sentido contrario|aft input|aft-column|nose up|cabrar|puxou|puxaram|pulled|opposed|opposing)\b/.test(text)
  const measuredOpposingForce = /\b(esfor[cç]o|force)\b.*\b(coluna|manche|control column|yoke|stick)\b.*\b(oposi[cç][aã]o|opposing|contra|contrari[ao])\b/.test(text)
  const actorOpposingForce = /\b(sic|pic|pilotos?|pilots?|tripulacao|tripula[cç][aã]o|comandante|captain|copiloto|first officer|pf|pm)\b.*\b(esfor[cç]o|force|input|atua[cç][aã]o)\b.*\b(nose up|nose down|cabrar|picar|oposi[cç][aã]o|opposing|contra|contrari[ao])\b/.test(text)
  // A control movement is not unsafe merely because a pilot made it. Require an explicit
  // opposing/unsafe relationship to a protective cue or a measured opposing force.
  return (controlSurface && ((protectiveCue && opposingInput) || measuredOpposingForce)) || (protectiveCue && actorOpposingForce)
}

export function isExplicitOperationalOmissionStatement(statement: string): boolean {
  const text = normalize(statement)
  return /\b(procedimentos?|checklists?|acoes?|it(?:em|ens)|etapas?|passos?|steps?|procedures?)\b.*\b(nao (?:foi|foram) (?:executad[oa]s?|realizad[oa]s?|cumprid[oa]s?|aplicad[oa]s?)|foi omitid[oa]|foram omitid[oa]s?|were not (?:executed|performed|completed|followed)|was not (?:executed|performed|completed|followed)|was omitted|were omitted)\b/.test(text)
    || /\b(omitiu|omitiram|omitted|skipped)\b.{0,140}\b(procedimento|checklist|item|etapa|passo|procedure|step)\b/.test(text)
    || /\b(procedimento|checklist|item|etapa|passo|procedure|step)\b.{0,140}\b(omitiu|omitiram|omitted|skipped)\b/.test(text)
    || /\b(nao executou|nao realizou|nao cumpriu|deixou de executar|deixou de realizar|failed to execute|failed to perform|did not execute|did not perform)\b/.test(text)
    || /\b(piloto|pilot|comandante|captain|copiloto|first officer|pf|pm|operador|operator)\b.{0,120}\b(deixou de acompanhar|deixou de monitorar|nao acompanhou|nao monitorou|failed to monitor|stopped monitoring|did not monitor)\b.{0,160}\b(indicacao|indication|display|informacao|information|parametro|parameter)\b/.test(text)
}

export function isExplicitOperationalDeviationStatement(statement: string): boolean {
  const text = normalize(statement)
  return /\b(aeronave|aircraft)\b.*\b(foi despachad[ao]|was dispatched)\b.*\b(sem|without|apesar|despite)\b.*\b(mel|restri[cç][oõ]es?|restriction|falha|fault|pane)\b/.test(text)
    || /\b(condi[cç][oõ]es?|weather|meteorolog)\b.*\b(nao foram avaliadas adequadamente|n[aã]o foram avaliadas adequadamente|were not adequately assessed)\b.*\b(cco|dov|pic|dispatch|dispatcher|pilot)\b/.test(text)
    || /\b(tripulacao|tripula[cç][aã]o|crew|pilotos?|pilots?|comandante|captain|copiloto|first officer|pic|sic|pf|pm|operador|operator)\b.{0,100}\b(manteve|mantiveram|permaneceu|permaneceram|continued|remained)\b.*\b(condi[cç][aã]o|gelo|icing|falha|fault|degradad|unsafe|insegur)\b/.test(text)
}

export function isOperationalEventStatement(statement: string): boolean {
  if (isNonCausalDocumentStatement(statement) || isProcedureReferenceStatement(statement) || isSystemDescriptionStatement(statement)) return false
  if (isDirectControlResponseStatement(statement) || isExplicitOperationalOmissionStatement(statement) || isExplicitOperationalDeviationStatement(statement)) return true
  const text = normalize(statement)
  const actorAction = /(?:\b(tripulacao|comandante|copiloto|pic|sic|piloto|piloto entrevistado|outro piloto|outro tripulante|o cara|entrevistado|pilot|crew|captain|first officer|eles|they|nos|we|eu|i|maintenance|manutencao|despachante|dov|cco)\b|\ba gente\b).*\b(decidiu|decidi|decidiram|decidimos|resolveu|resolvi|resolveram|resolvemos|continuou|continuei|continuaram|prosseguiu|prossegui|prosseguiram|manteve|mantive|mantiveram|selecionou|selecionei|acionou|acionei|desligou|desliguei|ligou|liguei|desacoplou|desacoplei|desacoplaram|cancelou|cancelei|cancelaram|reduziu|reduzi|reduziram|tentou|tentei|tentaram|colocou|coloquei|colocaram|aplicou|apliquei|aplicaram|executou|executei|omitiu|omiti|deixou de|deixei de|falhou|falhei|iniciou|iniciei|iniciado|iniciada|inseriu|inseri|programou|programei|ajustou|ajustei|configurou|configurei|verbalizou|informou|informei|comentou|comentei|observou|observei|notou|notei|percebeu|percebi|reconheceu|reconheci|processou|processei|perdeu|perdi|interpretou|interpretei|interpretaram|identificou|identifiquei|identificaram|confundiu|confundi|confundiram|associou|associei|associaram|tratou|tratei|trataram|conduziu|conduzi|conduziram|preparou|preparei|prepararam|passou|passei|passaram|tomou|tomei|tomaram|hesitou|hesitei|hesitaram|demorou|demorei|demoraram|esperou|esperei|esperaram|desceu|desci|desceram|subiu|subi|subiram|moveu|movi|moveram|alinhou|alinhei|alinharam|permitiu|permiti|permitiram|abandonou|abandonei|abandonaram|tirou|tirei|retirou|retirei|pegou|peguei|puxou|puxei|empurrou|empurrei|meteu|meti|julgou|julguei|preferiu|preferi|escolheu|escolhi|assumiu|assumi|pousou|pousei|continued|decided|resolved|selected|disengaged|cancelled|reduced|tried|put|applied|executed|failed to|did not|descended|climbed|moved|lined up|allowed|initiated|started|inserted|programmed|configured|noticed|perceived|recognized|processed|lost|interpreted|identified|misidentified|mistook|treated|conducted|prepared|proceeded|treated|hesitated|delayed|waited)\b/.test(text)
  const eventTime = /\b(as \d{1,2}h\d{2}|\d{1,2}:\d{2}|apos|depois|durante o voo|durante a aproximacao|durante a descida|em seguida|logo apos|na sequencia|when|after|during the flight|during approach|during descent|then)\b/.test(text)
  const eventVerb = /\b(foi apresentada|foi detectad|detectou|atingiu|reduziu|aumentou|entrou em|recebeu|apresentou|ocorreu|ativou|desativou|reconheceu|desceu|descendeu|permaneceu|alinhou|pousou|identified|detected|received|entered|activated|descended|remained|lined up|landed)\b/.test(text)
  const preflight = /\b(inspecao (?:de )?pre[- ]?voo|preflight inspection|inspecao visual|visual inspection)\b.*\b(concluida|completed|nao detectou|nada de anormal|nenhuma anormalidade|fora detectad[oa]|no abnormality|nothing abnormal|had been detected)\b/.test(text)
  const preflightRelease = /\b(aeronave|aircraft|inspecao|inspection)\b.*\b(pre[- ]?voo|preflight)\b.*\b(liberad[ao]|released|considerada apta|considered fit|sem travamento|not secured|unlatched|latches?|fechos?)\b/.test(text)
    || /\b(pre[- ]?voo|preflight)\b.*\b(aeronave|aircraft)\b.*\b(liberad[ao]|released|considerada apta|considered fit)\b/.test(text)
  return actorAction || preflight || preflightRelease || (eventTime && eventVerb)
}

function detectSection(line: string, current: SeraEvidenceSourceSection): SeraEvidenceSourceSection {
  const text = normalize(line)
  // Free-form evidence added during reanalysis is a factual supplement. Its position at the
  // end of the document must not turn it into report analysis or post-occurrence material.
  if (/informacoes adicionais para reanalise|additional information for reanalysis/.test(text)) return 'FACTUAL'
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
  if (/informacoes adicionais para reanalise|additional information for reanalysis/.test(text)) return 'CURRENT_EVENT'
  if (/\b(voo do acidente|accident flight|flight of the accident)\b/.test(text)) return 'CURRENT_EVENT'
  // Numbered prior legs of the same occurrence aircraft ("voo -1/-2/-3") are causal
  // pre-event history, not external comparators. They may support preconditions only.
  if (/\b(voo\s*[-–—]?\s*[123]\b|flight\s*[-–—]?\s*[123]\b)/.test(text)) return 'PRE_EVENT_CAUSAL_HISTORY'
  if (/\b(casos especificos com aeronaves da frota|outros? voos? da frota|em outro voo|another flight)\b/.test(text)) return 'HISTORICAL_COMPARATOR'
  const body = text.replace(/^(?:\d+(?:\.\d+)*\.?\s*)?/, '')
  if (/^fatos(?:\s|$)/.test(body)) return 'CURRENT_EVENT'
  if (/^(descricao do sistema|system description|manual|procedimentos?|procedure|informacoes meteorologicas gerais|general information)/.test(body)) return 'GENERAL_CONTEXT'
  return current
}

function assertionStatus(statement: string): SeraAssertionStatus {
  const text = normalize(statement)
  if (/\b(nao interferiu|nao contribuiu|nao observado|nao observada|nao evidenciado|nao evidenciada|sem evidencia|foi descartad[oa]|fator descartad[oa]|nao aplicavel)\b/.test(text)) return 'REJECTED_AS_FACTOR'
  if (/\b(nao envolve|nao envolveu|nao se tratava de|nao foi causado por|nao decorreu de)\b.{0,120}\b(falta|falha|deficiencia|problema|lacuna|treinamento|fadiga|pressao|ambiente|equipamento|supervisao|comunicacao)\b/.test(text)) return 'REJECTED_AS_FACTOR'
  // Explicit investigative hypotheses remain epistemically uncertain even when they contain
  // technical vocabulary. This check precedes modal/system-description handling.
  if (/\b(levantou-se a hipotese|sob essa hipotese|segundo essa hipotese|foi considerada.*hipotese|segunda hipotese|possibilidade de|nao foi possivel estabelecer qual hipotese|hipoteticamente|supostamente|possivelmente|talvez|pode ter sido|pode ter causado|podem ter causado)\b/.test(text)) return 'UNCERTAIN'
  // A recorded utterance is an affirmed event fact (what was said), even when the quoted
  // content uses “poderia/could”. Its truth-content can still be assessed separately.
  if (/\b(pic|sic|comandante|copiloto|piloto|captain|first officer|pilot)\b.{0,100}\b(comentou|disse|afirmou|informou|mencionou|said|commented|stated|reported|mentioned)\b/.test(text)) return 'AFFIRMED'
  // Documentary, procedural and system-description modality describes what a reference/system
  // allows or requires; words such as “poderia/could” are not epistemic uncertainty about the event.
  if (isNonCausalDocumentStatement(statement) || isProcedureReferenceStatement(statement) || isSystemDescriptionStatement(statement)) return 'AFFIRMED'
  if (/\b(ficaram muito focados|estavam muito focados|estava muito focado|estavam focados|estava focado|concentrados? em)\b/.test(text)) return 'AFFIRMED'
  if (/\b(manual|afm|fcom|qrh|procedimento|regra|norma|regulamento|sop|procedure|rule|regulation)\b.*\b(poderia|deveria|devia|exigia|estabelecia|determinava|required|mandated|stated|specified|could|could not|must|must not)\b/.test(text)) return 'AFFIRMED'
  if (/\b(poderia|pode ter|podem ter|supostamente|possivelmente|talvez|hipotese|hipoteticamente|sugere-se|sugere que|pode ter sido)\b/.test(text)) return 'UNCERTAIN'
  return 'AFFIRMED'
}

function classifyFactCategory(sentence: string): ExtractedFactCategory {
  const text = sentence.toLowerCase()
  if (/\b(crew|pilot|captain|first officer|operator|maintenance|controller|tripula|comandante|copiloto|piloto|piloto entrevistado|outro piloto|outro tripulante|o cara|entrevistado|nos|we|eu)\b|\ba gente\b/.test(text)) return 'actor'
  if (/\b(before|after|during|then|when|while|antes|depois|durante|ent[aã]o|quando|enquanto)\b/.test(text)) return 'timeline'
  if (/\b(cloud|visibility|weather|wind|rain|fog|night|wx|nuvem|visibilidade|tempo|chuva|nevoeiro|vento|meteorolog\w*|icing|gelo|sev ice|severe icing)\b/.test(text)) return 'environment'
  if (/\b(alert|warning|system|failure|fault|degraded|condition|unsafe|alerta|falha|condi[cç][aã]o|degradad)\b/.test(text)) return 'condition'
  if (/\b(crash|impact|collision|injury|fatal|damage|acidente|impacto|colis[aã]o|ferid|fatal|dano)\b/.test(text)) return 'outcome'
  if (/\b(did|failed|continued|resolved|decided|disengaged|cancelled|reduced|tried|descended|climbed|turned|landed|executed|applied|fez|fiz|falhou|falhei|continuou|continuei|resolveu|resolvi|resolveram|resolvemos|decidiu|decidi|decidiram|decidimos|desacoplou|desacoplei|cancelou|cancelei|reduziu|reduzi|tentou|tentei|colocou|coloquei|aplicou|apliquei|desceu|desci|subiu|subi|virou|virei|pousou|pousei|pouso|executou|executei|inseriu|inseri|programou|programei|selecionou|selecionei|ajustou|ajustei|configurou|configurei|acionou|acionei|digitou|digitei|identificou|identifiquei|confundiu|confundi|associou|associei|prosseguiu|prossegui|aproximou|aproximei|tirou|tirei|retirou|retirei|pegou|peguei|puxou|puxei|empurrou|empurrei|meteu|meti|julgou|julguei|preferiu|preferi|escolheu|escolhi|assumiu|assumi|desguarneci|nao foram executad|nao foram realizad|nao foi executad|nao foi realizad|foi despachad)\b/.test(text)) return 'action'
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
  if (/^\[?informacoes adicionais para reanalise\]?$/i.test(text) || /^\[?additional information for reanalysis\]?$/i.test(text)) return true
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
      // Interview transcripts use repeated dots as hesitation/pause markers. Treating
      // every ellipsis as a sentence boundary detaches pronouns and control inputs from
      // their actor (e.g. "o cara ... puxou o coletivo").
      .replace(/\.{2,}/g, ', ')
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
