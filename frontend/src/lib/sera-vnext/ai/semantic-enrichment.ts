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
import { splitNarrativeIntoSentenceRecords } from '../engine-v0/factual-extraction-helpers'

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
const PRECONDITION_CAUSAL_STATUS_VALUES = new Set(['PRESENT_CONTEXT', 'SOURCE_LINKED'])
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
  'implementedAction', 'feedbackImplementationFailure', 'slipLapse', 'proceduralOmission', 'implementationMismatch', 'correctAction',
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

function asConcepts(value: unknown): SeraSemanticDecisionConcept[] {
  if (!Array.isArray(value)) return []
  // V2: concept meaning is interpreted by the model and source-anchored. The deterministic
  // layer validates the enum and later applies the canonical tree; it does not re-interpret
  // the quote with keyword patterns.
  return [...new Set(value.filter((item): item is SeraSemanticDecisionConcept =>
    typeof item === 'string' && CONCEPT_VALUES.has(item as SeraSemanticDecisionConcept),
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

ARQUITETURA: você interpreta a linguagem natural e produz evidência estruturada. Você NÃO aplica a árvore SERA, NÃO escolhe códigos P/O/A e NÃO decide a classificação final. O motor determinístico fará isso depois.

Regras obrigatórias:
1. NÃO escolha, sugira nem escreva códigos SERA P/O/A.
2. NÃO invente fatos, limites, regras, intenção, causalidade ou estados mentais.
3. Cada annotation deve usar sourceQuote copiado literalmente do relato. Para FIRST_DEPARTURE e CRITICAL_UNSAFE_ACT, use o MENOR trecho literal suficiente para representar aquele marco dentro da frase; se dois atos estiverem na mesma frase, retorne dois trechos distintos. O servidor validará cada trecho contra a fonte.
4. Interprete linguagem coloquial, voz passiva, pronomes e correferências. actor deve ser a identidade funcional mais específica sustentada pelo conjunto do relato. Quando o próprio trecho já nomeia uma função simples (por exemplo, piloto, copiloto, comandante, PM ou PF), devolva essa identidade funcional de forma curta e estável; não crie descrições como "piloto que configurou a automação" para o mesmo ator. Se não houver base suficiente para individualizar o ator, use null; não substitua a lacuna por "tripulação não especificada".
5. FIRST_DEPARTURE é a PRIMEIRA transição observável da operação segura para insegura e é a única âncora P/O/A. CRITICAL_UNSAFE_ACT representa um ato/omissão operacional ou um estado operacional inseguro diretamente produzido na trajetória do evento; pode coincidir com FIRST_DEPARTURE ou ocorrer depois. NÃO use CRITICAL_UNSAFE_ACT para detecção, recuperação, correção, barreira, consequência final, condição latente, fator de supervisão/organização ou contexto preparatório. Esses elementos devem ser BARRIER, OUTCOME, PRECONDITION ou CONTEXT conforme o significado. Um CRITICAL_UNSAFE_ACT posterior NUNCA redefine a âncora P/O/A.
6. Se houver mais de um ato/omissão operacional na mesma ocorrência, preserve TODOS os marcos materialmente sustentados. Marque a primeira saída também como FIRST_DEPARTURE; marque atos/omissões/estados inseguros posteriores realmente pertencentes à trajetória operacional como CRITICAL_UNSAFE_ACT. Não funda dois atos separados por sequência temporal em uma única interpretação. Uma interrupção, chamada, demanda simultânea ou pressão que apenas cria contexto para uma falha posterior é PRECONDITION/CONTEXT, não CRITICAL_UNSAFE_ACT, salvo se a própria interrupção já constituir a saída da operação segura. Falha de outro tripulante em detectar, interromper, cross-checkar ou recuperar um desvio já iniciado é uma BARREIRA AUSENTE/FALHA (role BARRIER, podendo também haver PRECONDITION), não um novo CRITICAL_UNSAFE_ACT, a menos que esse tripulante introduza por sua própria ação um novo estado inseguro distinto.
7. Para PERCEPTION_STATE, OBJECTIVE_INTENT e ACTION_STRATEGY, temporalRelation é relativo à FIRST_DEPARTURE: PRE_ESCAPE = existia antes; AT_ESCAPE = existia no momento; POST_ESCAPE = surgiu depois. Uma fala posterior na entrevista pode ser PRE_ESCAPE/AT_ESCAPE somente quando relata retrospectivamente um estado que já existia antes/no ponto de fuga.
8. Diferencie AFFIRMED, REJECTED_AS_FACTOR e UNCERTAIN. Uma negação explícita NÃO pode virar evidência positiva. Se o fato está afirmado mas sua causalidade é incerta, mantenha AFFIRMED; não use UNCERTAIN apenas porque o nexo causal ainda não foi demonstrado.
9. Diferencie CURRENT_EVENT, PRE_EVENT_CAUSAL_HISTORY, HISTORICAL_COMPARATOR e GENERAL_CONTEXT.
10. PRECONDITION significa que o relato contém uma condição adversa/degradada ou vulnerabilidade contextual/preexistente potencialmente relevante antes/no ponto de fuga. Marque o fator mesmo quando o texto NÃO provar que ele causou a falha. Condições explicitamente normais/adequadas/disponíveis/corretas, ausência de falha, ausência de pressão ou fatores negados NÃO são pré-condições positivas; use CONTEXT/BARRIER ou REJECTED_AS_FACTOR conforme o caso. Use preconditionCategory canônica quando a categoria estiver sustentada.
11. Para toda annotation PRECONDITION, preconditionCausalStatus é obrigatório: PRESENT_CONTEXT quando o fator está factual e temporalmente presente mas a fonte não o liga explicitamente à falha ativa; SOURCE_LINKED somente quando a própria fonte afirma explicitamente que o fator contribuiu, favoreceu, causou ou tornou a FIRST_DEPARTURE mais provável. Não inferir SOURCE_LINKED por plausibilidade. Se usar SOURCE_LINKED, preconditionCausalTargetQuote é OBRIGATÓRIO e deve copiar literalmente a mesma FIRST_DEPARTURE à qual a fonte liga o fator. Se não houver uma ligação explícita àquela FIRST_DEPARTURE, use PRESENT_CONTEXT e preconditionCausalTargetQuote=null.
12. Para PRECONDITION com confiança HIGH, preconditionCategory não deve ficar nula quando o fator couber claramente em uma categoria canônica. Interprete o SIGNIFICADO, não palavras-chave. Categorias relevantes incluem: PHYSIOLOGICAL (sono, fadiga, sonolência, estado fisiológico), PSYCHOLOGICAL (atenção, distração, carga mental, estresse/bias), SOCIAL (autoridade, assertividade, pressão/dinâmica de equipe), PERSONAL_READINESS (preparo/descanso pessoal quando não houver estado fisiológico específico), TIME_PRESSURE (restrição/pressão temporal), EQUIPMENT, ENVIRONMENT, MONITORING_SUPERVISION (supervisão/monitoramento inadequado), PROVISION_RESOURCES (pessoal, reserva, ferramentas ou recursos insuficientes), ORGANIZATIONAL_PROCESS_PRACTICES (processo/planejamento organizacional inadequado), ORGANIZATIONAL_CLIMATE e OVERSIGHT (problema recorrente/sistêmico não detectado ou não corrigido). Sem equipe/tripulação reserva é PROVISION_RESOURCES; dificuldade recorrente já conhecida que persiste sem correção pode sustentar OVERSIGHT. Se houver carga de trabalho/demandas simultâneas competindo por atenção sem categoria canônica inequívoca, mantenha PRECONDITION com preconditionCategory=null e concepts=["attentionPressure"] em vez de forçar uma categoria errada.
13. concepts são propriedades factuais usadas depois por uma árvore determinística; marque somente conceitos diretamente sustentados pelo sourceQuote e pelo contexto explícito do relato. Não deduza um conceito apenas porque ele seria compatível com uma classificação. Em especial: slipLapse = incompatibilidade involuntária entre implementação e intenção, mas NÃO use slipLapse apenas porque o ator deixou de monitorar, acompanhar ou perceber uma indicação; nesses casos é preciso evidência de falha de implementação da ação pretendida. proceduralOmission = etapa/item/passo de checklist ou procedimento explicitamente omitido/não executado, sem evidência de decisão deliberada de omitir. implementationMismatch = seleção/configuração/comando efetivamente realizado diferente daquele que o ator explicitamente pretendia realizar. selectionSubtype = a alternativa/ação inadequada foi conscientemente escolhida e executada conforme escolhida. routineDeviation = o DESVIO/VIOLAÇÃO em si era habitual/normalizado; a mera palavra 'rotineira' qualificando uma etapa de checklist, tarefa ou procedimento NÃO é routineDeviation. attentionPressure = demandas concorrentes/simultâneas, distração, saturação ou carga de trabalho que disputavam atenção; não exige pressão de tempo. feedbackImplementationFailure = falha independente em verificar o resultado da própria ação. implementedAction sozinho NÃO significa que a ação foi implementada como pretendida.
14. Não transforme consequência pós-ponto de fuga em evidência de percepção, objetivo ou ação anterior. Recuperação, diagnóstico posterior e avaliação pós-pouso são POST_ESCAPE para P/O/A, salvo quando a frase explicitamente relata retrospectivamente o que já existia antes/no ponto de fuga.
15. safeOperationModel pode sintetizar o contraste operacional seguro somente a partir de fatos/regras presentes no relato. Não introduza números ou requisitos externos. evidenceQuotes deve conter frases literais do relato.
16. Perguntas, hipóteses e provocações do entrevistador/investigador NÃO são fatos do evento. Uma frase interrogativa não pode ser PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, PRECONDITION, FIRST_DEPARTURE ou CRITICAL_UNSAFE_ACT sem uma resposta factual separada.
17. Preserve os três slots: PERCEPTION_STATE = a representação contemporânea do ator sobre o que estava acontecendo/qual era o estado relevante à tarefa; OBJECTIVE_INTENT = o resultado operacional que pretendia alcançar; ACTION_STRATEGY = o meio/estratégia/ação escolhida para alcançar o objetivo. Não copie uma ação para OBJECTIVE_INTENT nem contexto para PERCEPTION_STATE. Em particular, "selecionou/configurou X diferente do que pretendia" revela a implementação pretendida da AÇÃO, não o objetivo operacional; não emita OBJECTIVE_INTENT apenas a partir da alternativa/comando/configuração que o ator pretendia selecionar. Se uma frase de ação contém uma crença/entendimento contemporâneo explícito do ator (por exemplo, ele agiu a partir do ponto que acreditava ser correto), emita também uma annotation PERCEPTION_STATE para a cláusula literal que expressa essa crença; não a perca só porque a mesma frase também contém ação. Esquecimento/falha de memória ('não se lembrou', 'esqueceu') por si só é mecanismo de implementação/lapso e NÃO substitui PERCEPTION_STATE; só marque P quando houver crença, interpretação, percepção ou entendimento positivo do estado da situação. Conhecer uma regra/procedimento, saber a ação correta, sentir cansaço/sonolência ou relatar estado fisiológico NÃO são PERCEPTION_STATE da situação operacional; preserve isso como CONTEXT/PRECONDITION/knownRule conforme apropriado.
18. Avaliação retrospectiva ("acho que julguei errado", diagnóstico posterior, constatação após pouso/recuperação) não substitui a crença contemporânea. A frase pode ser fonte de CONTEXT, mas só pode alimentar P/O/A quando descreve explicitamente o estado contemporâneo.
19. FIRST_DEPARTURE e CRITICAL_UNSAFE_ACT podem ter atores diferentes. Identifique o ator de cada marco independentemente. Não transfira o ator de recuperação, monitoramento ou consequência para outro ato.
20. Quando uma frase passiva não nomeia o executor, você pode preencher actor somente se outra evidência do próprio relato resolver inequivocamente a correferência/atribuição daquele MESMO ato. Caso contrário, actor=null.
21. Para PERCEPTION_STATE, OBJECTIVE_INTENT e ACTION_STRATEGY, além do sourceQuote literal, forneça displayInterpretation como uma frase curta, gramatical e factual que responda diretamente ao nó descritivo sem acrescentar fatos: P deve começar por "O operador acreditava/percebia..."; O por "O operador pretendia..."; A por "O operador tentava...". Esse campo é somente de apresentação e nunca substitui o sourceQuote como evidência. Para demais roles, use displayInterpretation=null. Evite fragmentos subordinados órfãos como "a partir de...", "porque..." ou "após...".

Concepts permitidos:
adequateAssessment, inadequateAssessment, sensoryLimitation, knowledgeLimitation, perceptionCapabilityPresent, attentionPressure, timeManagementPressure, informationAmbiguous, informationAvailableCorrect, informationUnavailable, safeGoal, knownRule, explicitAwareness, consciousDeviation, routineDeviation, exceptionalDeviation, managedRisk, unmanagedRisk, efficiencyObjective, safeAction, implementedAction, feedbackImplementationFailure, slipLapse, proceduralOmission, implementationMismatch, correctAction, incorrectAction, physicalActionLimitation, actionKnowledgeLimitation, actionCapabilityPresent, selectionUnderPressureFailed, feedbackUnderPressureFailed, selectionSubtype, feedbackSubtype, timeManagementAction.

Retorne SOMENTE JSON neste formato:
{"safeOperationModel":{"expectedSafeState":"...","expectedSafeAction":"...","evidenceQuotes":["frase literal"],"confidence":"HIGH"},"annotations":[{"sourceQuote":"frase literal","roles":["FIRST_DEPARTURE","CRITICAL_UNSAFE_ACT","DIRECT_ACTOR"],"concepts":["implementedAction"],"actor":"copiloto","temporalRelation":"AT_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"preconditionCausalStatus":null,"preconditionCausalTargetQuote":null,"displayInterpretation":null,"confidence":"HIGH","rationale":"justificativa curta"},{"sourceQuote":"frase literal de contexto","roles":["PRECONDITION"],"concepts":[],"actor":"copiloto","temporalRelation":"PRE_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":"PHYSIOLOGICAL","preconditionCausalStatus":"PRESENT_CONTEXT","preconditionCausalTargetQuote":null,"displayInterpretation":null,"confidence":"HIGH","rationale":"fator presente, nexo causal não afirmado pela fonte"}]}

Roles permitidos: FIRST_DEPARTURE, CRITICAL_UNSAFE_ACT, DIRECT_ACTOR, PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, PRECONDITION, BARRIER, OUTCOME, CONTEXT.
Temporal: PRE_ESCAPE, AT_ESCAPE, POST_ESCAPE, UNKNOWN.
Assertion: AFFIRMED, REJECTED_AS_FACTOR, UNCERTAIN.
Occurrence: CURRENT_EVENT, PRE_EVENT_CAUSAL_HISTORY, HISTORICAL_COMPARATOR, GENERAL_CONTEXT, UNKNOWN.
Precondition causal status: PRESENT_CONTEXT, SOURCE_LINKED ou null quando não for PRECONDITION. preconditionCausalTargetQuote: obrigatório para SOURCE_LINKED; null nos demais casos. displayInterpretation: frase de apresentação somente para P/O/A; null nos demais roles.
Confidence: LOW, MEDIUM, HIGH.

RELATO:
${narrative}`
}

function occurrenceSemanticAuditPrompt(narrative: string): string {
  const records = splitNarrativeIntoSentenceRecords(narrative)
    .filter((record) => !['RECOMMENDATION', 'ADMINISTRATIVE'].includes(record.sourceSection))
    .slice(0, 180)
  const excerpt = records.map((record) => `[S${record.sourceSentenceIndex}] ${record.statement}`).join('\n')

  return `Faça uma auditoria semântica de COMPLETUDE da ocorrência. Leia todas as frases abaixo; não use padrões de palavras-chave. A finalidade desta segunda passagem é garantir que a primeira leitura não tenha omitido marcos operacionais ou fatores contextuais relevantes.

Regras:
- NÃO classifique códigos SERA P/O/A e NÃO invente fatos.
- FIRST_DEPARTURE = primeira saída observável seguro→inseguro e única âncora P/O/A.
- CRITICAL_UNSAFE_ACT = ato/omissão operacional ou estado operacional inseguro diretamente produzido na trajetória. NÃO rotule como CRITICAL_UNSAFE_ACT: detecção, recuperação, correção, consequência final, interrupção/demanda que apenas cria contexto, condição latente, supervisão deficiente, decisão gerencial de prioridade/recursos ou outro PRECONDITION. Se outro tripulante percebe/monitora um desvio já iniciado mas não o interrompe, não insiste, não faz cross-check ou não recupera, isso é falha/ausência de BARRIER e não um novo CRITICAL_UNSAFE_ACT, salvo se sua própria ação introduzir novo estado inseguro distinto. Preserve atos/omissões/estados inseguros posteriores separados da FIRST_DEPARTURE; não funda eventos distintos.
- Retorne TODOS os marcos materialmente sustentados (máximo 12) e os PRECONDITION factuais relevantes antes/no FIRST_DEPARTURE (máximo 16).
- Para voz passiva, actor pode ser preenchido apenas quando o próprio relato resolve inequivocamente quem executou aquele mesmo ato; caso contrário use null. Use identidade funcional curta e estável; não paraphrase o ator em uma descrição da ação.
- Para PRECONDITION, use preconditionCategory canônica e preconditionCausalStatus=PRESENT_CONTEXT quando uma condição adversa/degradada está presente mas a fonte não declara nexo; SOURCE_LINKED apenas quando a fonte declara explicitamente contribuição causal à FIRST_DEPARTURE. SOURCE_LINKED exige preconditionCausalTargetQuote copiando literalmente a FIRST_DEPARTURE alvo; sem alvo explícito use PRESENT_CONTEXT. NÃO deixe preconditionCategory nula quando o significado couber claramente numa categoria: sono/fadiga/sonolência→PHYSIOLOGICAL; autoridade/dinâmica de equipe→SOCIAL; pressão temporal→TIME_PRESSURE; supervisão inadequada→MONITORING_SUPERVISION; insuficiência de pessoal/reserva/recursos→PROVISION_RESOURCES; processo/planejamento organizacional inadequado→ORGANIZATIONAL_PROCESS_PRACTICES; problema recorrente/sistêmico persistente→OVERSIGHT. Estado normal/adequado, ausência de falha, ausência de pressão ou fator negado deve ficar fora de PRECONDITION positiva.
- Fator afirmado com causalidade não demonstrada continua assertionStatus=AFFIRMED. UNCERTAIN é para incerteza sobre a existência do próprio fato.
- Contexto de outro episódio, comparador histórico, recuperação e consequência não pode migrar para P/O/A da FIRST_DEPARTURE.
- sourceQuote deve copiar literalmente o menor trecho suficiente do texto depois de [S#], sem o identificador. Se houver dois atos na mesma frase, devolva spans distintos para cada marco.

Retorne SOMENTE JSON: {"annotations":[{"sourceQuote":"frase literal","roles":["CRITICAL_UNSAFE_ACT","DIRECT_ACTOR"],"concepts":[],"actor":"ator ou null","temporalRelation":"POST_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"preconditionCausalStatus":null,"preconditionCausalTargetQuote":null,"displayInterpretation":null,"confidence":"HIGH","rationale":"curta"},{"sourceQuote":"frase literal","roles":["PRECONDITION"],"concepts":[],"actor":"ator ou null","temporalRelation":"PRE_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":"PHYSIOLOGICAL","preconditionCausalStatus":"PRESENT_CONTEXT","preconditionCausalTargetQuote":null,"displayInterpretation":null,"confidence":"HIGH","rationale":"curta"}]}

FRASES DO RELATO:
${excerpt}`
}

export function focusedPoaEvidenceExcerpt(args: {
  narrative: string
  escapePoint: string
  directActor: string
}): string {
  const records = splitNarrativeIntoSentenceRecords(args.narrative)
    .filter((record) => !['RECOMMENDATION', 'ADMINISTRATIVE'].includes(record.sourceSection))
    .filter((record) => record.occurrenceScope !== 'HISTORICAL_COMPARATOR')
  const escape = findSourceSentence(args.narrative, args.escapePoint)
  const escapeIndex = escape?.sourceSentenceIndex ?? null
  const local = records.filter((record) =>
    escapeIndex != null && Math.abs(record.sourceSentenceIndex - escapeIndex) <= 9,
  )
  const localIds = new Set(local.map((record) => record.sourceSentenceIndex))
  const remaining = records
    .filter((record) => !localIds.has(record.sourceSentenceIndex))
    .slice(0, 140)
  const format = (items: typeof records) => items.map((record) => `[S${record.sourceSentenceIndex}] ${record.statement}`).join('\n')
  return `JANELA LOCAL DO PONTO DE FUGA SERA:
${format(local)}

DEMAIS FRASES FACTUAIS DO RELATO PARA INTERPRETAÇÃO SEMÂNTICA (sem pré-filtragem por palavras-chave):
${format(remaining)}`
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
- Uma frase pode aparecer muito depois na entrevista e ainda ser PRE_ESCAPE/AT_ESCAPE se ela descrever retrospectivamente o estado que existia antes/no ponto de fuga. Se houver crença, entendimento ou percepção contemporânea explicitamente atribuída ao ator, produza PERCEPTION_STATE mesmo que a mesma frase também descreva uma ação; preserve a cláusula literal que sustenta o estado mental. PERCEPTION_STATE exige uma representação positiva da situação operacional; mero esquecimento/falha de memória ('não se lembrou', 'esqueceu'), conhecimento de regra/procedimento, saber a ação correta, cansaço, sonolência ou outro estado fisiológico NÃO respondem, sozinhos, o que o ator acreditava estar acontecendo e não devem ser marcados como PERCEPTION_STATE.
- Uma ação concreta pode ser ACTION_STRATEGY quando descreve o meio usado no próprio ponto de fuga, mesmo sem usar a palavra "estratégia". Isso não autoriza inferir OBJECTIVE_INTENT. A alternativa, modo, controle, comando ou configuração que o ator pretendia selecionar é intenção de implementação da ação, NÃO um objetivo operacional; não produza OBJECTIVE_INTENT apenas porque o texto diz que selecionou algo diferente do que pretendia.
- Para conceitos: slipLapse descreve incompatibilidade involuntária entre implementação e intenção e não deve ser inferido apenas de falha de monitoramento/atenção. proceduralOmission marca etapa/item/passo de checklist ou procedimento explicitamente omitido/não executado sem decisão deliberada de omitir. implementationMismatch marca seleção/configuração/comando efetivamente realizado diferente do que o ator explicitamente pretendia realizar. selectionSubtype descreve escolha inadequada executada conforme escolhida. routineDeviation exige que o DESVIO/VIOLAÇÃO seja habitual/normalizado; 'etapa rotineira', 'item rotineiro' ou 'procedimento rotineiro' não bastam. attentionPressure descreve demandas simultâneas, distração, saturação ou carga de trabalho competindo por atenção e não deve ser confundido com timeManagementPressure. Não use esses conceitos um no lugar do outro.
- Não use percepção, intenção ou ação de outro ator como se fosse do ator direto.
- Não use recuperação, diagnóstico posterior, resultado, avaliação pós-evento ou consequência como P/O/A anterior.
- Atos posteriores podem existir no relato, mas devem ficar fora desta passagem P/O/A.
- Se a frase descreve uma decisão/estado do evento atual causado por experiência anterior, occurrenceScope deve ser CURRENT_EVENT; PRE_EVENT_CAUSAL_HISTORY é reservado ao fato histórico em si.
- Se o ator declara não saber o que pensou/pretendeu, marque PERCEPTION_STATE/OBJECTIVE_INTENT como UNCERTAIN; não invente a lacuna.
- sourceQuote deve ser um trecho literal exato do relato, preferencialmente o menor trecho suficiente para sustentar aquela evidência. Para P/O/A, não use um fragmento subordinado órfão: inclua a cláusula factual suficiente para entender a crença, intenção ou estratégia.
- Para cada PERCEPTION_STATE, OBJECTIVE_INTENT ou ACTION_STRATEGY, forneça também displayInterpretation como frase curta e gramatical que responda diretamente ao nó ("O operador acreditava...", "O operador pretendia...", "O operador tentava...") sem acrescentar fatos. Esse campo é apenas de apresentação.
- Retorne somente evidências realmente sustentadas. Se um eixo não tiver evidência, não produza annotation para ele.

Roles permitidos nesta passagem: PERCEPTION_STATE, OBJECTIVE_INTENT, ACTION_STRATEGY, BARRIER.
Concepts permitidos: adequateAssessment, inadequateAssessment, sensoryLimitation, knowledgeLimitation, perceptionCapabilityPresent, attentionPressure, timeManagementPressure, informationAmbiguous, informationAvailableCorrect, informationUnavailable, safeGoal, knownRule, explicitAwareness, consciousDeviation, routineDeviation, exceptionalDeviation, managedRisk, unmanagedRisk, efficiencyObjective, safeAction, implementedAction, feedbackImplementationFailure, slipLapse, proceduralOmission, implementationMismatch, correctAction, incorrectAction, physicalActionLimitation, actionKnowledgeLimitation, actionCapabilityPresent, selectionUnderPressureFailed, feedbackUnderPressureFailed, selectionSubtype, feedbackSubtype, timeManagementAction.

Retorne SOMENTE JSON:
{"annotations":[{"sourceQuote":"frase literal","roles":["PERCEPTION_STATE"],"concepts":[],"actor":"${args.directActor}","temporalRelation":"AT_ESCAPE","assertionStatus":"AFFIRMED","occurrenceScope":"CURRENT_EVENT","preconditionCategory":null,"preconditionCausalStatus":null,"preconditionCausalTargetQuote":null,"displayInterpretation":"O operador acreditava que ...","confidence":"HIGH","rationale":"curta"}]}

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
  const preconditionCausalStatusRaw = asString(raw.preconditionCausalStatus)
  const preconditionCausalTargetRaw = asString(raw.preconditionCausalTargetQuote)
  const causalTarget = preconditionCausalTargetRaw ? findSourceSentence(narrative, preconditionCausalTargetRaw) : null
  const displayInterpretationRaw = asString(raw.displayInterpretation)
  const assertionStatus: SeraAssertionStatus = ASSERTION_VALUES.has(assertionRaw as SeraAssertionStatus)
    ? assertionRaw as SeraAssertionStatus
    : 'AFFIRMED'

  return {
    id: `AI-SEM-${index + 1}`,
    sourceQuote: quote.trim(),
    sourceSentenceIndex: source.sourceSentenceIndex,
    roles,
    concepts: asConcepts(raw.concepts),
    actor: asString(raw.actor),
    temporalRelation: TEMPORAL_VALUES.has(temporalRaw) ? temporalRaw as SeraSemanticEvidenceAnnotation['temporalRelation'] : 'UNKNOWN',
    assertionStatus,
    occurrenceScope: SCOPE_VALUES.has(scopeRaw as SeraOccurrenceScope) ? scopeRaw as SeraOccurrenceScope : 'UNKNOWN',
    preconditionCategory: preconditionRaw && PRECONDITION_VALUES.has(preconditionRaw) ? preconditionRaw as SeraSemanticEvidenceAnnotation['preconditionCategory'] : null,
    preconditionCausalStatus: preconditionCausalStatusRaw && PRECONDITION_CAUSAL_STATUS_VALUES.has(preconditionCausalStatusRaw)
      ? preconditionCausalStatusRaw as NonNullable<SeraSemanticEvidenceAnnotation['preconditionCausalStatus']>
      : null,
    preconditionCausalTargetQuote: preconditionCausalStatusRaw === 'SOURCE_LINKED' && causalTarget
      ? preconditionCausalTargetRaw!.trim()
      : null,
    displayInterpretation: displayInterpretationRaw?.trim().slice(0, 500) || null,
    confidence: CONFIDENCE_VALUES.has(confidenceRaw as SeraConfidence) ? confidenceRaw as SeraConfidence : 'MEDIUM',
    rationale: asString(raw.rationale),
  }
}
function semanticAnnotationPosition(narrative: string, item: SeraSemanticEvidenceAnnotation): number {
  const source = findSourceSentence(narrative, item.sourceQuote)
  if (!source) return Number.MAX_SAFE_INTEGER
  const statement = normalizeSourceText(source.statement)
  const quote = normalizeSourceText(item.sourceQuote)
  return source.sourceSentenceIndex * 1_000_000 + Math.max(0, statement.indexOf(quote))
}

function normalizePostEscapeSemantics(narrative: string, annotations: SeraSemanticEvidenceAnnotation[]): SeraSemanticEvidenceAnnotation[] {
  const firstDeparture = annotations
    .filter((item) => item.assertionStatus === 'AFFIRMED' && item.confidence !== 'LOW' && item.roles.includes('FIRST_DEPARTURE'))
    .sort((a, b) => semanticAnnotationPosition(narrative, a) - semanticAnnotationPosition(narrative, b))[0]
  if (!firstDeparture) return annotations
  const firstPosition = semanticAnnotationPosition(narrative, firstDeparture)

  return annotations.map((item) => {
    const position = semanticAnnotationPosition(narrative, item)
    let roles = item.roles
    // FIRST_DEPARTURE is a methodological singleton. If the semantic model marks a later
    // landmark as another first departure, preserve its other roles but remove the duplicate
    // FIRST_DEPARTURE tag instead of letting it create a second P/O/A anchor.
    if (position > firstPosition && roles.includes('FIRST_DEPARTURE')) {
      roles = roles.filter((role) => role !== 'FIRST_DEPARTURE')
    }
    // Structural temporal guard only. Meaning came from the model; position determines
    // whether a later occurrence landmark/outcome is downstream of the unique SERA anchor.
    if (position > firstPosition && (roles.includes('CRITICAL_UNSAFE_ACT') || roles.includes('OUTCOME'))) {
      return { ...item, roles, temporalRelation: 'POST_ESCAPE' as const }
    }
    return roles === item.roles ? item : { ...item, roles }
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
    const key = `${annotation.sourceSentenceIndex}:${annotation.roles.join(',')}:${annotation.actor ?? ''}:${annotation.preconditionCategory ?? ''}:${annotation.preconditionCausalStatus ?? ''}:${annotation.preconditionCausalTargetQuote ?? ''}:${annotation.displayInterpretation ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(annotation)
  }

  // Second semantic pass is a completeness audit, not a regex rescue. It sees the full
  // source sentence sequence and is asked to recover omitted occurrence landmarks and
  // precondition context even when the primary pass already found one critical act.
  try {
    const audit = await askJson(
      systemPrompt(args.locale),
      occurrenceSemanticAuditPrompt(args.narrative),
      'sera-vnext-semantic-occurrence-audit',
      { maxTokens: 8000 },
    )
    const auditItems = Array.isArray(audit.annotations) ? audit.annotations.slice(0, 32) : []
    for (const [auditIndex, item] of auditItems.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        rejected += 1
        continue
      }
      const annotation = buildAnnotation(item as Record<string, unknown>, args.narrative, rawAnnotations.length + auditIndex)
      if (!annotation) {
        rejected += 1
        continue
      }
      const allowed = annotation.roles.some((role) =>
        ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'PRECONDITION', 'BARRIER', 'CONTEXT', 'OUTCOME'].includes(role),
      )
      if (!allowed) {
        rejected += 1
        continue
      }
      const key = `${annotation.sourceSentenceIndex}:${annotation.roles.join(',')}:${annotation.actor ?? ''}:${annotation.preconditionCategory ?? ''}:${annotation.preconditionCausalStatus ?? ''}:${annotation.preconditionCausalTargetQuote ?? ''}:${annotation.displayInterpretation ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      accepted.push(annotation)
    }
  } catch (error) {
    console.warn('[SERA semantic occurrence audit] falling back to primary semantic pass', error instanceof Error ? error.message : String(error))
  }

  if (accepted.length === 0) {
    throw new Error('SERA_SEMANTIC_AI_NO_VERIFIABLE_EVIDENCE')
  }

  const normalizedAnnotations = normalizePostEscapeSemantics(args.narrative, accepted)

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
      schemaVersion: 'SERA_SEMANTIC_AI_V2',
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

  const normalized = normalizePostEscapeSemantics(args.narrative, accepted)
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
      schemaVersion: 'SERA_SEMANTIC_AI_V2',
    },
  }
}
