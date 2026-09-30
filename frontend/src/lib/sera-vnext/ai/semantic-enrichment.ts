import { askJson, getActiveProvider, getModelName } from '@/lib/sera/llm'
import type {
  SeraAssertionStatus,
  SeraConfidence,
  SeraOccurrenceScope,
  SeraSemanticDecisionConcept,
  SeraSemanticEnrichmentMeta,
  SeraSemanticEvidenceAnnotation,
  SeraSemanticEvidenceRole,
  SeraSemanticSafeOperationModel,
} from '../engine-contract'
import { isOperationalEventStatement, splitNarrativeIntoSentenceRecords } from '../engine-v0/factual-extraction-helpers'

const ROLE_VALUES = new Set<SeraSemanticEvidenceRole>([
  'FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR',
  'PERCEPTION_STATE', 'OBJECTIVE_INTENT', 'ACTION_STRATEGY',
  'PRECONDITION', 'BARRIER', 'OUTCOME', 'CONTEXT',
])

const ASSERTION_VALUES = new Set<SeraAssertionStatus>(['AFFIRMED', 'REJECTED_AS_FACTOR', 'UNCERTAIN'])
const SCOPE_VALUES = new Set<SeraOccurrenceScope>([
  'CURRENT_EVENT', 'PRE_EVENT_CAUSAL_HISTORY', 'HISTORICAL_COMPARATOR', 'GENERAL_CONTEXT', 'UNKNOWN',
])
const CONFIDENCE_VALUES = new Set<SeraConfidence>(['LOW', 'MEDIUM', 'HIGH'])
const TEMPORAL_VALUES = new Set(['PRE_ESCAPE', 'AT_ESCAPE', 'POST_ESCAPE', 'UNKNOWN'])
const PRECONDITION_VALUES = new Set([
  'PHYSIOLOGICAL', 'PSYCHOLOGICAL', 'SOCIAL', 'PHYSICAL_CAPABILITY', 'PERSONAL_READINESS',
  'TRAINING_SELECTION', 'QUALIFICATION_AUTHORIZATION', 'TIME_PRESSURE', 'OBJECTIVES', 'EQUIPMENT',
  'WORKSPACE', 'ENVIRONMENT', 'FORMING_INTENT', 'COMMUNICATING_INTENT', 'MONITORING_SUPERVISION',
  'MISSION', 'PROVISION_RESOURCES', 'RULES_REGULATIONS', 'ORGANIZATIONAL_PROCESS_PRACTICES',
  'ORGANIZATIONAL_CLIMATE', 'OVERSIGHT',
])

const CONCEPT_VALUES = new Set<SeraSemanticDecisionConcept>([
  'adequateAssessment', 'inadequateAssessment', 'sensoryLimitation', 'knowledgeLimitation',
  'perceptionCapabilityPresent', 'attentionPressure', 'timeManagementPressure',
  'informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable',
  'safeGoal', 'knownRule', 'explicitAwareness', 'consciousDeviation', 'routineDeviation',
  'exceptionalDeviation', 'managedRisk', 'unmanagedRisk', 'efficiencyObjective', 'safeAction',
  'implementedAction', 'feedbackImplementationFailure', 'slipLapse', 'correctAction',
  'incorrectAction', 'physicalActionLimitation', 'actionKnowledgeLimitation',
  'actionCapabilityPresent', 'selectionUnderPressureFailed', 'feedbackUnderPressureFailed',
  'selectionSubtype', 'feedbackSubtype', 'timeManagementAction',
])

function normalizeSourceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findSourceSentence(narrative: string, quote: string) {
  const records = splitNarrativeIntoSentenceRecords(narrative)
  const normalizedQuote = normalizeSourceText(quote)
  if (normalizedQuote.length < 8) return null
  for (const record of records) {
    const normalizedStatement = normalizeSourceText(record.statement)
    if (normalizedStatement === normalizedQuote) return record
    if (normalizedQuote.length >= 24 && normalizedStatement.includes(normalizedQuote)) return record
    if (normalizedStatement.length >= 24 && normalizedQuote.includes(normalizedStatement)) return record
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function conceptSupportedByQuote(concept: SeraSemanticDecisionConcept, quote: string): boolean {
  const text = normalizeSourceText(quote)
  const rules: Partial<Record<SeraSemanticDecisionConcept, RegExp>> = {
    knownRule: /\b(regra|procedimento|padroniza[cç][aã]o|limite|manual|sop|norma|regulamento|rule|procedure|standard|limit|must|required)\b/i,
    explicitAwareness: /\b(sabia|sabiam|ciente|consciente|reconhecia|reconheceu|knew|aware|recognized)\b/i,
    consciousDeviation: /\b(mesmo assim|apesar disso|sabendo que|ainda assim|decidiu continuar|resolveu continuar|desrespeitou|violou|desvio consciente|despite|even so|knowing that|knowingly|deliberate(?:ly)?|violat)\b/i,
    routineDeviation: /\b(rotina|rotineir|habitual|normalmente|costumava|costume|frequente|recorrente|sempre fazia|routine|habitual|normally|usually|frequent|regularly)\b/i,
    exceptionalDeviation: /\b(excepcional|exce[cç][aã]o|primeira vez|nunca antes|nunca havia|isolad[oa]|pontual|exceptional|one[- ]off|first time|never before|isolated)\b/i,
    sensoryLimitation: /\b(n[aã]o conseguia ver|n[aã]o podia ver|n[aã]o ouviu|n[aã]o enxerg|visibilidade restrita|sem refer[eê]ncia visual|could not see|couldn't see|could not hear|limited visibility|no visual reference)\b/i,
    knowledgeLimitation: /\b(n[aã]o sabia|n[aã]o conhecia|desconhecia|n[aã]o familiar|falta de conhecimento|falta de treinamento|treinamento insuficiente|not trained|lack of knowledge|lack of training|unfamiliar)\b/i,
    timeManagementPressure: /\b(press[aã]o de tempo|urg[eê]ncia|apressad|correria|atrasad|janela curta|time pressure|rushed|urgent|running late|behind schedule|tight window)\b/i,
    efficiencyObjective: /\b(efici[eê]ncia|economia|custo|produtividade|prazo|hor[aá]rio|schedule|efficiency|economy|cost|productivity|deadline|on time)\b/i,
    safeAction: /\b(correto|correta|segur[oa]|deveria|procedimento previsto|right action|correct|safe|should)\b/i,
    incorrectAction: /\b(errad[oa]|incorret[oa]|erro|n[aã]o deveria|contra a padroniza[cç][aã]o|quando o certo|wrong|incorrect|error|should not|instead of)\b/i,
  }
  const rule = rules[concept]
  if (!rule) return true
  if (concept === 'routineDeviation' && /\b(nunca|never)\b/i.test(text)) return false
  return rule.test(text)
}

function asConcepts(value: unknown, quote: string): SeraSemanticDecisionConcept[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is SeraSemanticDecisionConcept =>
    typeof item === 'string'
      && CONCEPT_VALUES.has(item as SeraSemanticDecisionConcept)
      && conceptSupportedByQuote(item as SeraSemanticDecisionConcept, quote),
  ))]
}

function asRoles(value: unknown): SeraSemanticEvidenceRole[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is SeraSemanticEvidenceRole =>
    typeof item === 'string' && ROLE_VALUES.has(item as SeraSemanticEvidenceRole),
  ))]
}

function systemPrompt(locale: 'pt-BR' | 'en'): string {
  return locale === 'pt-BR'
    ? `Você é o extrator semântico do HFA/SERA. Sua tarefa é interpretar linguagem natural de relatos operacionais, inclusive entrevistas coloquiais, sem classificar códigos P/O/A e sem inventar fatos.`
    : `You are the HFA/SERA semantic extractor. Interpret natural-language operational narratives, including colloquial interviews, without assigning P/O/A codes and without inventing facts.`
}
function userPrompt(narrative: string, locale: 'pt-BR' | 'en'): string {
  const language = locale === 'pt-BR' ? 'português' : 'English'
  return `Analise semanticamente o relato abaixo em ${language}.

Regras obrigatórias:
1. NÃO escolha, sugira nem escreva códigos SERA P/O/A.
2. NÃO invente fatos, limites, regras, intenção, causalidade ou estados mentais.
3. Cada annotation deve usar sourceQuote copiado literalmente de UMA frase do relato.
4. Interprete linguagem coloquial, pronomes e correferências; actor deve ser a identidade funcional mais específica sustentada pelo relato.
5. FIRST_DEPARTURE e CRITICAL_UNSAFE_ACT são marcos diferentes quando a evidência assim indicar. FIRST_DEPARTURE marca a PRIMEIRA transição efetiva seguro→inseguro; não marque como FIRST_DEPARTURE um antecedente apenas porque ocorreu antes (posição de estacionamento, contexto, meteorologia ou ato de outro ator) se a própria frase não sustentar que ali começou o estado inseguro. CRITICAL_UNSAFE_ACT marca o ato/condição humana crítica a ser analisada cognitivamente.
6. Diferencie tempo do documento de tempo do fato. Para PERCEPTION_STATE, OBJECTIVE_INTENT e ACTION_STRATEGY, temporalRelation é relativo ao CRITICAL_UNSAFE_ACT que ancora P/O/A: PRE_ESCAPE = existia antes dele; AT_ESCAPE = existia no momento dele; POST_ESCAPE = surgiu depois dele. Uma explicação dada depois na entrevista pode ser PRE_ESCAPE/AT_ESCAPE somente quando descreve retrospectivamente aquele estado anterior.
7. Diferencie AFFIRMED, REJECTED_AS_FACTOR e UNCERTAIN. Uma negação explícita (ex.: "não envolveu falta de treinamento") NÃO pode virar evidência positiva.
8. Diferencie CURRENT_EVENT, PRE_EVENT_CAUSAL_HISTORY, HISTORICAL_COMPARATOR e GENERAL_CONTEXT.
9. Para PRECONDITION, marque somente fator que o relato vincule factual ou causalmente ao CRITICAL_UNSAFE_ACT/falha ativa em análise. Contexto verdadeiro mas pertencente a outro episódio/decisão não é pré-condição desse ato. Use preconditionCategory canônica quando a categoria estiver sustentada; se o vínculo causal for apenas possível/ambíguo, use UNCERTAIN e confiança no máximo MEDIUM.
10. Para PRECONDITION com confiança HIGH, preconditionCategory não deve ficar nula quando o fator couber claramente em uma categoria canônica (ex.: fadiga→PHYSIOLOGICAL; falha/lote defeituoso→EQUIPMENT; coordenação/CRM→SOCIAL ou MONITORING_SUPERVISION conforme o fato).
11. concepts são propriedades factuais usadas depois por uma árvore determinística; marque somente conceitos diretamente sustentados pelo sourceQuote. Não deduza um conceito apenas porque ele seria compatível com uma classificação.
12. Não transforme consequência pós-ato crítico em evidência de percepção, objetivo ou ação anterior. Recuperação, diagnóstico posterior e avaliação pós-pouso devem ser POST_ESCAPE para P/O/A, salvo quando a frase explicitamente relata retrospectivamente o que já existia antes/no ato crítico.
13. safeOperationModel pode sintetizar o contraste operacional seguro somente a partir de fatos/regras presentes no relato. Não introduza números ou requisitos externos. evidenceQuotes deve conter frases literais do relato.
14. Se o relato contiver mais de um episódio operacional ou mais de um ato humano potencialmente crítico, não escolha apenas um por conveniência: anote todos os candidatos materialmente sustentados como CRITICAL_UNSAFE_ACT, cada um com seu ator. O motor determinístico fará a seleção. Não confunda recuperação, consequência ou simples contexto com ato crítico.
15. Perguntas, hipóteses e provocações do entrevistador/investigador NÃO são fatos do evento. Uma frase interrogativa (por exemplo "E se...?", "Você acha que...?") não pode ser PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, PRECONDITION, FIRST_DEPARTURE ou CRITICAL_UNSAFE_ACT sem uma resposta factual separada do entrevistado.
16. Preserve a semântica dos três slots: PERCEPTION_STATE = o que o ator acreditava/percebia sobre o estado do mundo naquele momento; OBJECTIVE_INTENT = o resultado que pretendia alcançar; ACTION_STRATEGY = o meio/estratégia/ação escolhida para alcançar o objetivo. Não copie uma ação para OBJECTIVE_INTENT nem uma narrativa contextual para PERCEPTION_STATE.
17. Avaliação retrospectiva ("eu acho que fiz um julgamento errado", diagnóstico posterior, constatação após pouso/recuperação) não substitui a crença contemporânea. Quando uma frase mistura crença antes do ato e descoberta posterior, preserve a frase como fonte mas marque o conteúdo posterior como POST_ESCAPE e não o use para responder P/O/A anterior.
18. FIRST_DEPARTURE e CRITICAL_UNSAFE_ACT podem ter atores diferentes. Atores coletivos da primeira saída ("nós/a gente") não devem ser transferidos para o ato crítico individual; identifique o ator de cada marco de forma independente.

Concepts permitidos:
adequateAssessment, inadequateAssessment, sensoryLimitation, knowledgeLimitation, perceptionCapabilityPresent, attentionPressure, timeManagementPressure, informationAmbiguous, informationAvailableCorrect, informationUnavailable, safeGoal, knownRule, explicitAwareness, consciousDeviation, routineDeviation, exceptionalDeviation, managedRisk, unmanagedRisk, efficiencyObjective, safeAction, implementedAction, feedbackImplementationFailure, slipLapse, correctAction, incorrectAction, physicalActionLimitation, actionKnowledgeLimitation, actionCapabilityPresent, selectionUnderPressureFailed, feedbackUnderPressureFailed, selectionSubtype, feedbackSubtype, timeManagementAction.

Retorne SOMENTE JSON neste formato:
{"safeOperationModel":{"expectedSafeState":"...","expectedSafeAction":"...","evidenceQuotes":["frase literal"],"confidence":"HIGH"},"annotations":[{"sourceQuote":"frase literal","roles":["CRITICAL_UNSAFE_ACT"],"concepts":["implementedAction"],"actor":"outro piloto","temporalRelation":"AT_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"confidence":"HIGH","rationale":"justificativa curta"}]}

Roles permitidos: FIRST_DEPARTURE, CRITICAL_UNSAFE_ACT, DIRECT_ACTOR, PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, PRECONDITION, BARRIER, OUTCOME, CONTEXT.
Temporal: PRE_ESCAPE, AT_ESCAPE, POST_ESCAPE, UNKNOWN.
Assertion: AFFIRMED, REJECTED_AS_FACTOR, UNCERTAIN.
Occurrence: CURRENT_EVENT, PRE_EVENT_CAUSAL_HISTORY, HISTORICAL_COMPARATOR, GENERAL_CONTEXT, UNKNOWN.
Confidence: LOW, MEDIUM, HIGH.

RELATO:
${narrative}`
}

function criticalActRescuePrompt(narrative: string): string {
  const candidates = splitNarrativeIntoSentenceRecords(narrative)
    .filter((record) => record.assertionStatus === 'AFFIRMED')
    .filter((record) => !['REPORT_ANALYSIS', 'RECOMMENDATION', 'ADMINISTRATIVE'].includes(record.sourceSection))
    .filter((record) => !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(record.occurrenceScope))
    .filter((record) => isOperationalEventStatement(record.statement))
    .slice(0, 90)
  const excerpt = candidates.map((record) => `[S${record.sourceSentenceIndex}] ${record.statement}`).join('\n')

  return `Revise SOMENTE os candidatos operacionais abaixo para localizar atos/omissões humanas concretos que possam ser CRITICAL_UNSAFE_ACT e identificar o respectivo ator direto. Esta é uma segunda passagem porque a extração principal não fechou um ato crítico humano com segurança.

Regras:
- NÃO classifique códigos SERA P/O/A e NÃO invente fatos.
- Examine TODOS os candidatos antes de responder e retorne todos os atos materialmente sustentados (máximo 6), não apenas o primeiro cronológico.
- Prefira ações/omissões observáveis que criaram, mantiveram ou agravaram o estado perigoso. Movimento de comandos, escolha de técnica, desacoplamento, continuação deliberada e omissão operacional merecem atenção especial quando presentes.
- Uma fala de discordância, consequência, recuperação, meteorologia ou pane técnica isolada NÃO é ato crítico só por ocorrer perto do evento.
- Se houver mais de um episódio operacional, mantenha os candidatos separados; não deixe um episódio posterior apagar o ato crítico de um episódio anterior.
- sourceQuote deve copiar literalmente o texto depois do identificador [S#], sem incluir [S#]. actor deve ser a identidade funcional mais específica sustentada.
- Use roles ["CRITICAL_UNSAFE_ACT","DIRECT_ACTOR"] e acrescente ACTION_STRATEGY/PERCEPTION_STATE/OBJECTIVE_INTENT somente se a MESMA frase sustentar diretamente esse papel.
- temporalRelation do próprio ato crítico = AT_ESCAPE.

Retorne SOMENTE JSON: {"annotations":[{"sourceQuote":"frase literal","roles":["CRITICAL_UNSAFE_ACT","DIRECT_ACTOR"],"concepts":[],"actor":"ator","temporalRelation":"AT_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"confidence":"HIGH","rationale":"curta"}]}

CANDIDATOS OPERACIONAIS:
${excerpt}`
}

export function focusedPoaEvidenceExcerpt(args: {
  narrative: string
  escapePoint: string
  directActor: string
}): string {
  const records = splitNarrativeIntoSentenceRecords(args.narrative)
  const escape = findSourceSentence(args.narrative, args.escapePoint)
  const escapeIndex = escape?.sourceSentenceIndex ?? null
  const normalizedActor = normalizeSourceText(args.directActor)
  const firstPersonActor = /\b(piloto entrevistado|entrevistad[oa]|narrador|declarante)\b/.test(normalizedActor)
  const actorTokens = normalizedActor
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !['piloto', 'outro', 'direto', 'comandante', 'treinamento', 'tripulacao'].includes(token))
  const mentalIntentCue = /\b(acredit|ach|pens|sab|perceb|entend|julg|imagin|quer|pretend|inten|objetiv|para ajudar|pra ajudar|proativ|a fim de|com o objetivo|decid|resolv|opt|escolh|believ|thought|knew|perceiv|intended|wanted|decided|chose|aimed)\w*/i
  const strategyCue = /\b(usar|utiliz|execut|realiz|conduz|prossegu|continu|tent|selecion|acion|aproxim|pous|arremet|subir|descer|pux|empurr|tir|peg|segur|desacopl|barra na barra|pitch down|use|using|execute|perform|conduct|proceed|continue|try|select|activate|approach|land|climb|descend|pull|push)\w*/i
  const firstPersonCue = /\b(eu|me|meu|minha|comigo|pensei|achei|acreditei|queria|pretendia|decidi|resolvi|tentei|fiz|tirei|peguei)\b/i
  const actorLinked = (statement: string) => {
    const normalized = normalizeSourceText(statement)
    if (firstPersonActor && firstPersonCue.test(statement)) return true
    if (/tripulacao|tripulação|decisao conjunta|decisão conjunta|flight crew|crew/.test(normalizedActor)) {
      return /\b(a gente|n[oó]s|ambos|tripula[cç][aã]o|we|both)\b/i.test(statement)
    }
    return actorTokens.some((token) => normalized.includes(token)) || normalized.includes(normalizedActor)
  }

  const local = records.filter((record) =>
    escapeIndex != null && Math.abs(record.sourceSentenceIndex - escapeIndex) <= 9,
  )
  const retrospective = records
    .filter((record) => !local.some((item) => item.sourceSentenceIndex === record.sourceSentenceIndex))
    .filter((record) => !['RECOMMENDATION', 'ADMINISTRATIVE'].includes(record.sourceSection))
    .filter((record) => record.occurrenceScope !== 'HISTORICAL_COMPARATOR')
    .map((record) => {
      let score = 0
      if (actorLinked(record.statement)) score += 4
      if (mentalIntentCue.test(record.statement)) score += 3
      if (strategyCue.test(record.statement)) score += 2
      if (escapeIndex != null && Math.abs(record.sourceSentenceIndex - escapeIndex) <= 20) score += 2
      return { record, score }
    })
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score || a.record.sourceSentenceIndex - b.record.sourceSentenceIndex)
    .slice(0, 28)
    .map((item) => item.record)
    .sort((a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex)

  const format = (items: typeof records) => items.map((record) => `[S${record.sourceSentenceIndex}] ${record.statement}`).join('\n')
  return `JANELA LOCAL DO PONTO DE FUGA SERA:\n${format(local)}\n\nEVIDÊNCIAS RETROSPECTIVAS DO MESMO ATOR/DECISÃO PRIORIZADAS:\n${format(retrospective)}`
}

function focusedPoaPrompt(args: {
  narrative: string
  escapePoint: string
  directActor: string
}): string {
  return `Faça uma segunda leitura semântica focalizada SOMENTE no ponto de fuga SERA e no ator abaixo. Esta etapa não classifica SERA; ela apenas recupera evidência P/O/A ancorada no texto.

PONTO DE FUGA SERA JÁ SELECIONADO PELO MOTOR (primeira travessia seguro→inseguro):
${args.escapePoint}

ATOR DIRETO NO PONTO DE FUGA:
${args.directActor}

Regras obrigatórias:
- NÃO escreva códigos P/O/A e NÃO mude o ponto de fuga nem o ator.
- P/O/A pertencem exclusivamente ao momento da primeira saída da operação segura. Um ato crítico posterior, recuperação ou consequência NÃO pode substituir esta âncora.
- Examine os recortes em três perguntas independentes: (P) o que ESTE ator via, percebia, acreditava ou entendia imediatamente antes/no ponto de fuga; (O) para quê/por quê ESTE ator agia, qual objetivo/intenção levou à primeira saída; (A) qual método, estratégia, decisão, comando ou meio ESTE ator usou naquele ponto de fuga.
- Resolva correferências coloquiais pelo contexto local. Se o ator for coletivo, use somente evidência atribuível à decisão coletiva; não importe estado mental exclusivo de um tripulante.
- Uma frase pode aparecer muito depois na entrevista e ainda ser PRE_ESCAPE/AT_ESCAPE se ela descrever retrospectivamente o estado que existia antes/no ponto de fuga.
- Uma ação concreta pode ser ACTION_STRATEGY quando descreve o meio usado no próprio ponto de fuga, mesmo sem usar a palavra "estratégia". Isso não autoriza inferir OBJECTIVE_INTENT.
- Não use percepção, intenção ou ação de outro ator como se fosse do ator direto.
- Não use recuperação, diagnóstico posterior, resultado, avaliação pós-evento ou consequência como P/O/A anterior.
- Atos posteriores podem existir no relato, mas devem ficar fora desta passagem P/O/A.
- Se a frase descreve uma decisão/estado do evento atual causado por experiência anterior, occurrenceScope deve ser CURRENT_EVENT; PRE_EVENT_CAUSAL_HISTORY é reservado ao fato histórico em si.
- Se o ator declara não saber o que pensou/pretendeu, marque PERCEPTION_STATE/OBJECTIVE_INTENT como UNCERTAIN; não invente a lacuna.
- sourceQuote deve ser UMA frase literal do relato e cada evidência deve estar ancorada nessa frase.
- Retorne somente evidências realmente sustentadas. Se um eixo não tiver evidência, não produza annotation para ele.

Roles permitidos nesta passagem: PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, BARRIER.
Concepts permitidos: adequateAssessment, inadequateAssessment, sensoryLimitation, knowledgeLimitation, perceptionCapabilityPresent, attentionPressure, timeManagementPressure, informationAmbiguous, informationAvailableCorrect, informationUnavailable, safeGoal, knownRule, explicitAwareness, consciousDeviation, routineDeviation, exceptionalDeviation, managedRisk, unmanagedRisk, efficiencyObjective, safeAction, implementedAction, feedbackImplementationFailure, slipLapse, correctAction, incorrectAction, physicalActionLimitation, actionKnowledgeLimitation, actionCapabilityPresent, selectionUnderPressureFailed, feedbackUnderPressureFailed, selectionSubtype, feedbackSubtype, timeManagementAction.

Retorne SOMENTE JSON:
{"annotations":[{"sourceQuote":"frase literal","roles":["PERCEPTION_STATE"],"concepts":[],"actor":"${args.directActor}","temporalRelation":"AT_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"confidence":"HIGH","rationale":"curta"}]}

RECORTES PRIORIZADOS DO RELATO (os identificadores [S#] servem apenas para contexto; sourceQuote deve copiar somente a frase):
${focusedPoaEvidenceExcerpt(args)}`
}

function buildAnnotation(raw: Record<string, unknown>, narrative: string, index: number): SeraSemanticEvidenceAnnotation | null {
  const quote = asString(raw.sourceQuote)
  if (!quote) return null
  const source = findSourceSentence(narrative, quote)
  if (!source) return null

  const roles = asRoles(raw.roles)
  if (!roles.length) return null
  const temporalRaw = asString(raw.temporalRelation) ?? 'UNKNOWN'
  const assertionRaw = asString(raw.assertionStatus) ?? source.assertionStatus ?? 'AFFIRMED'
  const scopeRaw = asString(raw.occurrenceScope) ?? source.occurrenceScope ?? 'UNKNOWN'
  const confidenceRaw = asString(raw.confidence) ?? 'MEDIUM'
  const preconditionRaw = asString(raw.preconditionCategory)
  const mentalStateRecallUnknown = roles.some((role) => role === 'PERCEPTION_STATE' || role === 'OBJECTIVE_INTENT')
    && !roles.some((role) => role === 'ACTION_STRATEGY' || role === 'CRITICAL_UNSAFE_ACT')
    && /\b(n[aã]o sei (?:o que passou na minha cabe[cç]a|explicar|por que fiz|o que pensei|o que eu pensei)|n[aã]o consigo explicar|n[aã]o lembro (?:o que|por que)|i do not know what went through my mind|i don't know what went through my mind|can(?:not|'t) explain why|do not remember what i thought)\b/i.test(source.statement)
  const assertionStatus: SeraAssertionStatus = mentalStateRecallUnknown
    ? 'UNCERTAIN'
    : ASSERTION_VALUES.has(assertionRaw as SeraAssertionStatus)
      ? assertionRaw as SeraAssertionStatus
      : 'AFFIRMED'

  return {
    id: `AI-SEM-${index + 1}`,
    sourceQuote: source.statement,
    sourceSentenceIndex: source.sourceSentenceIndex,
    roles,
    concepts: asConcepts(raw.concepts, source.statement),
    actor: asString(raw.actor),
    temporalRelation: TEMPORAL_VALUES.has(temporalRaw) ? temporalRaw as SeraSemanticEvidenceAnnotation['temporalRelation'] : 'UNKNOWN',
    assertionStatus,
    occurrenceScope: SCOPE_VALUES.has(scopeRaw as SeraOccurrenceScope) ? scopeRaw as SeraOccurrenceScope : 'UNKNOWN',
    preconditionCategory: preconditionRaw && PRECONDITION_VALUES.has(preconditionRaw) ? preconditionRaw as SeraSemanticEvidenceAnnotation['preconditionCategory'] : null,
    confidence: CONFIDENCE_VALUES.has(confidenceRaw as SeraConfidence) ? confidenceRaw as SeraConfidence : 'MEDIUM',
    rationale: asString(raw.rationale),
  }
}
function normalizePostEscapeSemantics(annotations: SeraSemanticEvidenceAnnotation[]): SeraSemanticEvidenceAnnotation[] {
  const departures = annotations.filter((item) =>
    item.assertionStatus === 'AFFIRMED'
    && item.confidence !== 'LOW'
    && item.roles.includes('FIRST_DEPARTURE'),
  )
  if (!departures.length) return annotations

  const normActor = (actor: string | null) => normalizeSourceText(actor ?? '')
  const retrospectiveCue = /\b(naquele momento|naquela hora|na hora|a percepcao que .* tinha|acreditava|achava|sabia|estava ciente|at that moment|at the time|believed|thought|knew|was aware)\b/i
  const postCue = /\b(depois|apos|após|p[oó]s-|quando isso aconteceu|come[cç]ou a (?:mexer|mover|descer|subir|afundar)|entrou em estol|percebi que .* subiu|vi que .* n[aã]o era|fui procurar|recuperei|assumi os comandos|after|afterward|then|started to|began to|recovered|took control)\b/i
  const shortContinuation = /^\s*(?:enfim[,;]?\s*)?(?:botei|fiz|executei|recoloquei|pousei|did it|landed)\b/i

  return annotations.map((item) => {
    if (item.temporalRelation !== 'AT_ESCAPE') return item
    if (!item.roles.some((role) => role === 'PERCEPTION_STATE' || role === 'OBJECTIVE_INTENT' || role === 'ACTION_STRATEGY')) return item
    const sameActorDepartures = departures.filter((candidate) => {
      if (!item.actor || !candidate.actor) return true
      const a = normActor(item.actor)
      const b = normActor(candidate.actor)
      return a === b || a.includes(b) || b.includes(a)
    })
    const anchors = sameActorDepartures.length ? sameActorDepartures : departures
    const preceding = anchors
      .filter((candidate) => candidate.sourceSentenceIndex < item.sourceSentenceIndex)
      .sort((a, b) => b.sourceSentenceIndex - a.sourceSentenceIndex)[0]
    if (!preceding) return item
    if (retrospectiveCue.test(normalizeSourceText(item.sourceQuote))) return item
    const text = item.sourceQuote
    if (postCue.test(text) || shortContinuation.test(text)) {
      return { ...item, temporalRelation: 'POST_ESCAPE' as const }
    }
    return item
  })
}

function buildSafeOperationModel(raw: unknown, narrative: string): SeraSemanticSafeOperationModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>
  const expectedSafeState = asString(item.expectedSafeState)
  const expectedSafeAction = asString(item.expectedSafeAction)
  const confidenceRaw = asString(item.confidence) ?? 'LOW'
  const quotes = Array.isArray(item.evidenceQuotes) ? item.evidenceQuotes : []
  const evidenceQuotes = [...new Set(quotes
    .map((quote) => typeof quote === 'string' ? findSourceSentence(narrative, quote)?.statement ?? null : null)
    .filter((quote): quote is string => Boolean(quote)))]
  if (!expectedSafeState || !expectedSafeAction || evidenceQuotes.length === 0) return null
  return {
    expectedSafeState,
    expectedSafeAction,
    evidenceQuotes: evidenceQuotes.slice(0, 5),
    confidence: CONFIDENCE_VALUES.has(confidenceRaw as SeraConfidence) ? confidenceRaw as SeraConfidence : 'LOW',
  }
}

export async function enrichSeraNarrativeSemantically(args: {
  narrative: string
  locale: 'pt-BR' | 'en'
}): Promise<{
  annotations: SeraSemanticEvidenceAnnotation[]
  safeOperationModel: SeraSemanticSafeOperationModel | null
  meta: SeraSemanticEnrichmentMeta
}> {
  const requestedAt = new Date().toISOString()
  const parsed = await askJson(
    systemPrompt(args.locale),
    userPrompt(args.narrative, args.locale),
    'sera-vnext-semantic-enrichment',
    { maxTokens: 12000 },
  )

  const safeOperationModel = buildSafeOperationModel(parsed.safeOperationModel, args.narrative)
  const rawAnnotations = Array.isArray(parsed.annotations) ? parsed.annotations.slice(0, 80) : []
  const accepted: SeraSemanticEvidenceAnnotation[] = []
  let rejected = 0
  const seen = new Set<string>()

  for (const [index, item] of rawAnnotations.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejected += 1
      continue
    }
    const annotation = buildAnnotation(item as Record<string, unknown>, args.narrative, index)
    if (!annotation) {
      rejected += 1
      continue
    }
    const key = `${annotation.sourceSentenceIndex}:${annotation.roles.join(',')}:${annotation.actor ?? ''}:${annotation.preconditionCategory ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(annotation)
  }

  const hasResolvedCriticalAct = accepted.some((annotation) =>
    annotation.assertionStatus === 'AFFIRMED'
    && annotation.confidence !== 'LOW'
    && annotation.roles.includes('CRITICAL_UNSAFE_ACT')
    && Boolean(annotation.actor),
  )
  if (!hasResolvedCriticalAct) {
    try {
      const rescue = await askJson(
        systemPrompt(args.locale),
        criticalActRescuePrompt(args.narrative),
        'sera-vnext-semantic-critical-act-rescue',
        { maxTokens: 5000 },
      )
      const rescueItems = Array.isArray(rescue.annotations) ? rescue.annotations.slice(0, 12) : []
      for (const [rescueIndex, item] of rescueItems.entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          rejected += 1
          continue
        }
        const annotation = buildAnnotation(item as Record<string, unknown>, args.narrative, rawAnnotations.length + rescueIndex)
        if (!annotation || !annotation.roles.includes('CRITICAL_UNSAFE_ACT')) {
          rejected += 1
          continue
        }
        const key = `${annotation.sourceSentenceIndex}:${annotation.roles.join(',')}:${annotation.actor ?? ''}:${annotation.preconditionCategory ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        accepted.push(annotation)
      }
    } catch (error) {
      console.warn('[SERA semantic rescue] unable to resolve a critical act', error instanceof Error ? error.message : String(error))
    }
  }

  if (accepted.length === 0) {
    throw new Error('SERA_SEMANTIC_AI_NO_VERIFIABLE_EVIDENCE')
  }

  const normalizedAnnotations = normalizePostEscapeSemantics(accepted)

  // callAi may load the user's active provider/key from persistence. Capture provenance
  // only after the call so the recorded provider/model is the one that actually ran.
  const provider = getActiveProvider()
  const model = getModelName(provider)

  return {
    annotations: normalizedAnnotations,
    safeOperationModel,
    meta: {
      provider,
      model,
      requestedAt,
      acceptedAnnotations: accepted.length,
      rejectedAnnotations: rejected,
      schemaVersion: 'SERA_SEMANTIC_AI_V1',
    },
  }
}
export async function enrichSeraPoaSemantically(args: {
  narrative: string
  locale: 'pt-BR' | 'en'
  escapePoint: string
  directActor: string
}): Promise<{ annotations: SeraSemanticEvidenceAnnotation[]; meta: SeraSemanticEnrichmentMeta }> {
  const requestedAt = new Date().toISOString()
  const parsed = await askJson(
    systemPrompt(args.locale),
    focusedPoaPrompt(args),
    'sera-vnext-semantic-poa-focus',
    { maxTokens: 5000 },
  )
  const rawAnnotations = Array.isArray(parsed.annotations) ? parsed.annotations.slice(0, 24) : []
  const accepted: SeraSemanticEvidenceAnnotation[] = []
  let rejected = 0
  const seen = new Set<string>()
  const allowedRoles = new Set<SeraSemanticEvidenceRole>(['PERCEPTION_STATE', 'OBJECTIVE_INTENT', 'ACTION_STRATEGY', 'BARRIER'])

  for (const [index, item] of rawAnnotations.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { rejected += 1; continue }
    const annotation = buildAnnotation(item as Record<string, unknown>, args.narrative, 1000 + index)
    if (!annotation) { rejected += 1; continue }
    const roles = annotation.roles.filter((role) => allowedRoles.has(role))
    if (!roles.length) { rejected += 1; continue }
    const focused = { ...annotation, roles }
    const key = `${focused.sourceSentenceIndex}:${roles.join(',')}:${focused.actor ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(focused)
  }

  const normalized = normalizePostEscapeSemantics(accepted)
  const provider = getActiveProvider()
  const model = getModelName(provider)
  return {
    annotations: normalized,
    meta: {
      provider,
      model,
      requestedAt,
      acceptedAnnotations: normalized.length,
      rejectedAnnotations: rejected,
      schemaVersion: 'SERA_SEMANTIC_AI_V1',
    },
  }
}
