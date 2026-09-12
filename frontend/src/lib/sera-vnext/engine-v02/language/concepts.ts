export type SeraEvidenceConcept =
  | 'adequateAssessment'
  | 'inadequateAssessment'
  | 'sensoryLimitation'
  | 'knowledgeLimitation'
  | 'perceptionCapabilityPresent'
  | 'attentionPressure'
  | 'timeManagementPressure'
  | 'informationAmbiguous'
  | 'informationAvailableCorrect'
  | 'informationUnavailable'
  | 'safeGoal'
  | 'knownRule'
  | 'explicitAwareness'
  | 'consciousDeviation'
  | 'routineDeviation'
  | 'exceptionalDeviation'
  | 'managedRisk'
  | 'unmanagedRisk'
  | 'safeAction'
  | 'implementedAction'
  | 'feedbackImplementationFailure'
  | 'slipLapse'
  | 'correctAction'
  | 'incorrectAction'
  | 'physicalActionLimitation'
  | 'actionKnowledgeLimitation'
  | 'actionCapabilityPresent'
  | 'selectionUnderPressureFailed'
  | 'feedbackUnderPressureFailed'
  | 'selectionSubtype'
  | 'feedbackSubtype'
  | 'timeManagementAction'
  | 'postEscapeOutcome'
  | 'preconditionAsEscape'
  | 'oeCode'
  | 'inventedQuestion'

export type SeraConceptMatch = {
  statement: string
  concept: SeraEvidenceConcept
}

// ── Negation helpers ──
const PT_NEGATION = /\b(n[aã]o|nem|nunca|jamais|sem|aus[eê]ncia de|falta de|deixou de|deixaram de)\b/i
const EN_NEGATION = /\b(not?|never|without|absence of|lack of|failed to|did not|does not|do not)\b/i

function negated(statement: string): boolean {
  return PT_NEGATION.test(statement) || EN_NEGATION.test(statement)
}

const CONCEPT_PATTERNS: Record<SeraEvidenceConcept, RegExp[]> = {
  adequateAssessment: [
    /\b(recognized|noticed|saw|perceived|aware|identified)\b.*\b(in time|warning|trend|deviation|unstable|low|correct)\b/i,
    /\bwarning was available\b/i,
    /\b(reconheceu|percebeu|notou|viu|identificou)\b.*\b(a tempo|alerta|tend[eê]ncia|desvio|inst[aá]vel|baixo|corret[ao])\b/i,
    /\bavalia[cç][aã]o (adequada|correta|apropriada|precisa)\b/i,
    /\bpercep[cç][aã]o (adequada|correta|apropriada)\b/i,
    /\bidentificou corretamente\b/i,
  ],
  inadequateAssessment: [
    /\b(did not|failed to|without)\b.*\b(perceiv\w*|notic\w*|see|recogniz\w*|identify|awareness|deviation|warning)\b/i,
    /\bwrong runway|wrong surface|misidentified|believed existed did not match|perceived state did not match\b/i,
    /\b(n[aã]o|sem|falhou em|deixou de|deixaram de)\b.*\b(perceber|percebeu|notar|notou|ver|viu|reconhecer|reconheceu|identificar|identificou|consci[eê]ncia|desvio|alerta|avaliar|avaliou)\b/i,
    /\b(pista errada|superf[ií]cie errada|identificou incorretamente|percep[cç][aã]o incorreta|avalia[cç][aã]o (incorreta|inadequada|errada|equivocada|falha))\b/i,
    /\b(n[aã]o) (percebeu|notou|viu|identificou|reconheceu)\b/i,
    /\binterpretou (errad|incorret|mal)\b/i,
    /\bentendeu (errad|incorret|mal)\b/i,
    /\b(misjudged|misread|misinterpreted|overlooked|missed)\b.*\b(situation|state|condition|warning|alert|indication)\b/i,
    /\b(horizon|visual reference|visual references|visual cues?)\b.*\b(hard(?:er)? to distinguish|difficult to distinguish|indistinct|lost|missing)\b/i,
    /\b(perdeu|perderam)\b.*\b(no[cç][aã]o|refer[eê]ncia)\b.*\b(altura|visual|horizonte)\b/i,
    /\b(significado|meaning)\b.*\b(n[aã]o (?:estava|ficou|era) claro|not clear|unclear|amb[ií]gu[ao]|ambiguous)\b/i,
  ],
  sensoryLimitation: [
    /\b(poor visibility|low visibility|reduced visibility|degraded visibility|degraded visual(?: environment| cues?)?|visual cues? (?:were )?(?:lost|missing|degraded|limited|insufficient|poor)|visual environment (?:was )?(?:degraded|poor|limited))\b/i,
    /\b(baixa visibilidade|visibilidade reduzida|visibilidade degradada|visual degradad[ao]|pistas? visuais? (?:perdid[ao]s?|ausentes?|degradad[ao]s?|limitad[ao]s?)|ambiente visual (?:degradad[ao]|ruim|limitad[ao]))\b/i,
    /\b(horizon|visual reference|visual references|sea surface|surface)\b.*\b(hard(?:er)? to distinguish|difficult to distinguish|lost|absent|missing|poor|dark|indistinct|confus\w*|obscur\w*)\b/i,
    /\b(horizonte|refer[eê]ncia visual|contato visual|superf[ií]cie)\b.*\b(perde\w*|ausente|dif[ií]cil|ruim|escuro|escura|indistint[oa]|confund\w*)\b/i,
    /\b(could not see|couldn't see|unable to see|visually impaired|blind|obscured)\b/i,
    /\b(n[aã]o conseguiu ver|n[aã]o podia ver|incapaz de ver|vis[aã]o prejudicada|encobert[ao])\b/i,
  ],
  knowledgeLimitation: [
    /\b(unfamiliar|knowledge gap|training gap|competence gap|not trained|lack of knowledge|lack of training|insufficient training)\b/i,
    /\b(n[aã]o familiar|lacuna de conhecimento|lacuna de treinamento|lacuna de compet[eê]ncia|n[aã]o treinad[ao]|desconhecia|falta de conhecimento|falta de treinamento|treinamento insuficiente)\b/i,
    /\b(n[aã]o|nunca) (tinha|havia|tiveram?) (recebido|feito|completado|realizado)\b.*\b(treinamento|curso|instru[cç][aã]o|capacita[cç][aã]o)\b/i,
    /\b(desconhecia|ignorava|n[aã]o sabia|n[aã]o conhecia|n[aã]o dominava)\b/i,
    /\b(not qualified|unqualified|inexperienced|lack of experience|unfamiliarity)\b/i,
    /\b(falta|aus[eê]ncia|lacuna|defici[eê]ncia)\b.*\b(conhecimento|treinamento|experi[eê]ncia|forma[cç][aã]o|qualifica[cç][aã]o)\b/i,
  ],
  perceptionCapabilityPresent: [
    /\b(capable|had capability|available instruments|visual cues available|could see|could perceive|trained)\b/i,
    /\b(capaz|tinha capacidade|instrumentos dispon[ií]veis|pistas visuais dispon[ií]veis|podia ver|podia perceber|treinad[ao])\b/i,
    /\b(tinha|possu[ií]a|dispunha de)\b.*\b(condi[cç][oõ]es|capacidade|habilidade|instrumentos|equipamentos?)\b/i,
    /\b(qualificad[ao]|habilitad[ao]|experiente|capacitad[ao])\b/i,
  ],
  attentionPressure: [
    /\b(distraction|attention saturation|fixation|workload|rushed|time pressure)\b/i,
    /\b(distra[cç][aã]o|satura[cç][aã]o de aten[cç][aã]o|fixa[cç][aã]o|carga de trabalho|apressad[ao]|press[aã]o de tempo)\b/i,
    /\b(aten[cç][aã]o|foco|concentra[cç][aã]o)\b.*\b(desviad[ao]|dividid[ao]|dispers[ao]|comprometid[ao]|prejudicad[ao]|saturad[ao])\b/i,
    /\b(preocupad[ao]|focado|concentrado|absorto|imerso)\b.*\b(outr[ao]|diferente|n[aã]o relacionad[ao]|demais)\b/i,
    /\b(tunnel[ing]*\s*vision|channelized attention|cognitive tunneling|task saturation)\b/i,
  ],
  timeManagementPressure: [
    /\b(time pressure|urgency|expedite|rushed sequence|schedule pressure)\b/i,
    /\b(press[aã]o de tempo|urg[eê]ncia|acelerar|sequ[eê]ncia apressada|press[aã]o de escala|press[aã]o operacional)\b/i,
    /\b(atrasad[ao]|atraso|demora|correria|correndo|apressad[ao])\b.*\b(voo|partida|chegada|escala|hor[aá]rio|turno)\b/i,
    /\b(recuperar|compensar|reduzir)\b.*\b(atraso|tempo|hor[aá]rio)\b/i,
    /\b(behind schedule|running late|behind time|tight schedule|slot pressure)\b/i,
    /\b(compromisso|obriga[cç][aã]o|meta|contrato)\b.*\b(hor[aá]rio|prazo|tempo|di[aá]ri[ao])\b/i,
  ],
  informationAmbiguous: [
    /\b(ambiguous|illusory|misleading|confusing|deceptive|conflicting information)\b/i,
    /\b(amb[ií]gu[ao]|ilus[oó]ri[ao]|enganos[ao]|confus[ao]|informa[cç][aã]o conflitante)\b/i,
    /\b(informa[cç][aã]o|dado|indica[cç][aã]o|alerta|sinal|mensagem)\b.*\b(contradit[oó]ri[ao]|inconsistente|incongruente|incompat[ií]vel|divergente)\b/i,
    /\b(n[aã]o) (era|estava|ficou|permaneceu)\b.*\b(claro|evidente|[oó]bvio|preciso|expl[ií]cito)\b/i,
    /\b(unclear|uncertain|doubtful|questionable|indeterminate)\b.*\b(whether|if|what|which|how)\b/i,
  ],
  informationAvailableCorrect: [
    /\b(information was available and correct|valid alert|correct indication|accurate information|correct information)\b/i,
    /\b(informa[cç][aã]o estava dispon[ií]vel e correta|alerta v[aá]lido|indica[cç][aã]o correta|informa[cç][aã]o precisa|informa[cç][aã]o correta)\b/i,
    /\b(a informa[cç][aã]o|o dado|o alerta|a indica[cç][aã]o)\b.*\b(estava|era|permanecia)\b.*\b(dispon[ií]vel|acess[ií]vel|presente|corret[ao]|precis[ao]|exat[ao])\b/i,
  ],
  informationUnavailable: [
    /\b(no warning|did not generate an alert|not available|missing information|failed alert|incorrect information|unavailable information)\b/i,
    /\b(sem alerta|n[aã]o gerou alerta|n[aã]o dispon[ií]vel|informa[cç][aã]o ausente|alerta falhou|informa[cç][aã]o incorreta|informa[cç][aã]o indispon[ií]vel)\b/i,
    /\b(informa[cç][aã]o|dado|alerta|aviso|sinal)\b.*\b(faltou|faltava|ausente|inexistente|omitid[ao]|suprimid[ao]|falh[ao]|falhou|n[aã]o (foi|era|estava))\b/i,
    /\b(n[aã]o) (recebeu|obteve|tinha|possu[ií]a|dispunha de)\b.*\b(informa[cç][aã]o|dado|relat[oó]rio|meteorologia)\b/i,
  ],
  safeGoal: [
    /\b(discontinued|go-around|go around|aborted|preserving safe|safe separation|recognized .* in time)\b/i,
    /\b(descontinuou|arremeteu|arremetida|abortou|preservando seguran[cç]a|separa[cç][aã]o segura|reconheceu .* a tempo)\b/i,
    /\b(interrompeu|suspendeu|cancelou|anulou)\b.*\b(aproxima[cç][aã]o|decolagem|procedimento|manobra|opera[cç][aã]o)\b/i,
  ],
  knownRule: [
    /\b(known rule|briefed procedure|required by sop|procedure required|clearance required|rule required|knew the rule)\b/i,
    /\b(regra conhecida|procedimento conhecido|previsto no sop|procedimento exigia|autoriza[cç][aã]o exigida|sabia da regra)\b/i,
    // Natural PT expressions
    /\b(sabia|conhecia|tinha (ci[eê]ncia|conhecimento)|estava ciente)\b.*\b(que|do)\b.*\b(n[aã]o (devia|podia|era para|deveria)|proibido|vedado|obrigat[oó]rio|exigido|necess[aá]rio)\b/i,
    /\b(o manual|o procedimento|a norma|o regulamento|a regra|a diretriz|o SOP)\b.*\b(exig\w*|determin\w*|estabelece\w*|define|requer|obriga|imp[eõ]e|prescreve|prev[eê])\b/i,
    /\b(estava|ficou|permaneceu)\b.*\b(estabelecido|definido|determinado|prescrito|previsto|escrito|documentado)\b.*\b(que|a|o)\b/i,
    // Natural EN expressions
    /\b(knew|was aware|had been told|had learned|was briefed|understood) (that|about|the)\b.*\b(should not|could not|must not|was not (allowed|permitted|authorized)|prohibited|forbidden|required|mandatory)\b/i,
    /\b(the manual|the procedure|the regulation|the rule|the SOP|the directive|the requirement) (stated|required|mandated|specified|called for|demanded|prescribed)\b/i,
    /\b(was|were) (required|mandated|obligated|supposed) to\b/i,
  ],
  explicitAwareness: [
    /\b(aware|recognized|knew|noticed|was warned|warning acknowledged|conscious of|despite knowing)\b/i,
    /\b(ciente|consciente|reconheceu|sabia|notou|foi alertad[ao]|alerta reconhecido|apesar de saber)\b/i,
    // Natural PT expressions
    /\b(sabia que|tinha (consci[eê]ncia|ci[eê]ncia|no[cç][aã]o) (de que|do que|que)|estava (ciente|consciente|a par) (de que|do que|que)|percebeu que|notou que|reparou que|constatou que|verificou que|identificou que|reconheceu que)\b/i,
    /\b(comentou|afirmou|disse|mencionou|observou|declarou|argumentou)\b.*\b(que|sobre)\b.*\b((n[aã]o|sem) (condi[cç][oõ]es|visibilidade|teto|margem|altura)|(estava|era) (abaixo|acima|fora|al[eé]m) (do|da))\b/i,
    /\b(mesmo|embora|ainda que|apesar de|a despeito de)\b.*\b(saber|conhecer|ter (ci[eê]ncia|conhecimento|consci[eê]ncia))\b/i,
    // Natural EN expressions
    /\b(knew that|was aware that|realized that|understood that|recognized that|noticed that|saw that|observed that|acknowledged that|was conscious of the fact that)\b/i,
    /\b(even though|although|despite|notwithstanding) (knowing|being aware|realizing|recognizing|understanding)\b/i,
    /\b(mentioned|stated|said|noted|commented|remarked|pointed out) that\b.*\b(below|above|outside|beyond|did not meet|was not|were not)\b/i,
  ],
  consciousDeviation: [
    /\b(knowingly|deliberately|intentionally|consciously|chose to deviate|intentional deviation|decided to violate)\b/i,
    /\b(deliberadamente|intencionalmente|conscientemente|optou por desviar|desvio intencional|decidiu violar)\b/i,
    // Natural PT expressions
    /\b(decdiu|optou|escolheu|resolveu|determinou|deliberou)\b.*\b(continuar|prosseguir|seguir|avan[cç]ar|proceder|manter|tentar|fazer|realizar|executar|partir|decolar)\b.*\b((mesmo|ainda que|embora|apesar de|a despeito de)|(sem|contra|violando|descumprindo|ignorando|desrespeitando))\b/i,
    /\b(decdiu|optou|escolheu|resolveu) (n[aã]o|nem)\b.*\b(interromper|abortar|cancelar|suspender|arremeter|descontinuar)\b/i,
    /\b((contrariando|violando|descumprindo|ignorando|desobedecendo|infringindo) (o|a|os|as)|em desacordo com|em viola[cç][aã]o d[eo]|em descumprimento d[eo])\b.*\b(procedimento|regra|norma|manual|regulamento|determina[cç][aã]o|instru[cç][aã]o|orienta[cç][aã]o|pol[ií]tica|diretriz|SOP|padr[aã]o)\b/i,
    // Natural EN expressions
    /\b(decided|chose|opted|elected|resolved|determined) to\b.*\b(continue|proceed|go ahead|press on|carry on|keep going|take off|depart|not (abort|discontinue|interrupt|stop|go-around))\b.*\b((even though|although|despite|notwithstanding)|(without|against|in violation of|contrary to|disregarding|ignoring))\b/i,
    /\b(decided|chose|opted) not to\b.*\b(abort|discontinue|interrupt|stop|cancel|go-around|go around)\b/i,
    /\b(in violation of|contrary to|against|disregarding|ignoring|defying|flouting)\b.*\b(procedure|rule|regulation|requirement|directive|order|instruction|policy|SOP|standard|minimum)\b/i,
    /\b(went ahead|pressed on|carried on|proceeded anyway|continued regardless|took off anyway)\b/i,
  ],
  routineDeviation: [
    /\b(routine violation|normal practice|customary deviation|habitual noncompliance|usually continued)\b/i,
    /\b(viola[cç][aã]o de rotina|pr[aá]tica de rotina|pr[aá]tica normal|desvio costumeiro|descumprimento habitual|costumava continuar)\b/i,
    /\b(era (comum|normal|habitual|rotineiro|frequente|usual|corriqueiro) (fazer|realizar|executar|proceder|continuar|prosseguir|desviar|ignorar|pular))\b/i,
    /\b(it was (common|normal|usual|routine|customary|standard practice) to\b)\b/i,
  ],
  exceptionalDeviation: [
    /\b(exceptional violation|one-off violation|isolated violation|unusual deliberate deviation)\b/i,
    /\b(viola[cç][aã]o excepcional|viola[cç][aã]o isolada|desvio deliberado incomum)\b/i,
    /\b((primeira|[uú]nica|rara) vez|nunca (tinha|havia) (feito|ocorrido|acontecido)|fora do (comum|habitual|normal|padr[aã]o))\b.*\b(fez|realizou|executou|decidiu|optou)\b/i,
    /\b(first|only|rare) time\b.*\b(had ever|had done|occurred)\b/i,
  ],
  managedRisk: [
    /\b(discontinued|go-around|go around|aborted|preserving safe|safe separation|risk was managed)\b/i,
    /\b(descontinuou|arremeteu|arremetida|abortou|preservando seguran[cç]a|separa[cç][aã]o segura|risco foi gerenciado)\b/i,
    /\b(interrompeu|suspendeu|cancelou)\b.*\b(antes|a tempo|imediatamente|prontamente)\b/i,
  ],
  unmanagedRisk: [
    /\b(schedule pressure|save time|expedite|accept risk|rushed|risk not managed|did not limit risk)\b/i,
    /\b(press[aã]o de escala|ganhar tempo|acelerar|aceitou risco|apressad[ao]|risco n[aã]o gerenciado|n[aã]o limitou o risco)\b/i,
    /\b(assumiu|aceitou|tolerou|correu|ignorou|subestimou|menosprezou)\b.*\b(risco|perigo|amea[cç]a)\b/i,
    /\b(prosseguiu|continuou|manteve)\b.*\b((apesar do|mesmo com o|a despeito do|ignorando o) risco|sem (mitigar|reduzir|controlar|gerenciar))\b/i,
  ],
  safeAction: [
    /\b(executed a go-around|executed a safe go-around|discontinued|aborted|prompt correction|safe separation)\b/i,
    /\b(executou arremetida|arremeteu com seguran[cç]a|descontinuou|abortou|corre[cç][aã]o imediata|separa[cç][aã]o segura)\b/i,
    /\b(iniciou|executou|realizou|fez|completou)\b.*\b(arremetida|go-around|subida|escape|evas[aã]o|corre[cç][aã]o)\b/i,
    /\b(assumiu|tomou) o controle\b.*\b(recuperou|corrigiu|estabilizou|salvou)\b/i,
  ],
  implementedAction: [
    /\b(executed|selected|configured|turned|descended|climbed|moved|lined up|applied|continued)\b/i,
    /\b(executou|selecionou|configurou|virou|desceu|subiu|moveu|alinhou|aplicou|continuou)\b/i,
    /\b(realizou|efetuou|procedeu|conduziu|operou|manobrou|comandou|pilotou|acionou|inseriu|programou|digitou)\b/i,
  ],
  feedbackImplementationFailure: [
    /\b(readback failed|failed feedback|feedback was not checked|verification failed|did not cross-check|callout missed)\b/i,
    /\b(readback falhou|feedback falhou|retorno n[aã]o foi verificado|verifica[cç][aã]o falhou|n[aã]o cruzou a checagem|callout perdido)\b/i,
    /\b(n[aã]o) (confirmou|checou|verificou|conferiu|validou|cruzou|cotejou)\b.*\b((o|a) (leitura|resposta|a[cç][aã]o|informa[cç][aã]o|dado|valor|comando|instru[cç][aã]o)|retorno|feedback)\b/i,
    /\b(n[aã]o) (confirmou|checou|verificou|conferiu|validou)\b.*\b(resultado|efeito)\b.*\b(pr[oó]pria a[cç][aã]o|pr[oó]prio comando)\b/i,
    /\b(both pilots|crew members?|neither pilot|copilot) (did not|failed to|neglected to)\b.*\b(check|verify|confirm|cross-check|validate)\b/i,
  ],
  slipLapse: [
    /\b(descended below|continued below|failed to monitor|did not verify|left an invalid|allowed .* to develop|late recovery|inadvertently)\b/i,
    /\b(desceu abaixo|continuou abaixo|falhou em monitorar|n[aã]o verificou|deixou .* inv[aá]lid[ao]|permitiu .* desenvolver|recupera[cç][aã]o tardia|inadvertidamente)\b/i,
    /\b(sem querer|sem inten[cç][aã]o|acidentalmente|por engano|por descuido|por lapso|por distra[cç][aã]o|esqueceu|esqueceram|omitiu|omitiram)\b/i,
    /\b(accidentally|unintentionally|mistakenly|inadvertently|by mistake|by accident|overlooked|forgot|neglected|omitted)\b/i,
  ],
  correctAction: [
    /\b(go-around|discontinued|aborted|prompt correction|safe separation|correct action|adequate action)\b/i,
    /\b(arremetida|descontinuou|abortou|corre[cç][aã]o imediata|separa[cç][aã]o segura|a[cç][aã]o correta|a[cç][aã]o adequada)\b/i,
    /\b(respondeu|reagiu|atuou|procedeu) (correta|adequada|apropriadamente|conforme|de acordo)\b/i,
    /\b(tomou a decis[aã]o (correta|certa|acertada|apropriada))\b/i,
  ],
  incorrectAction: [
    /\b(wrong runway|wrong surface|selected wrong|wrong mode|lined up toward|lined up on|continued below|descended below|unstable approach|incorrect action)\b/i,
    /\b(pista errada|superf[ií]cie errada|selecionou errado|modo errado|alinhou para|continuou abaixo|desceu abaixo|aproxima[cç][aã]o inst[aá]vel|a[cç][aã]o incorreta)\b/i,
    /\b((respondeu|reagiu|atuou|procedeu|executou|realizou|fez|cometeu) (errad|incorret|inadequad|equivocad|imprudentemente)|cometeu (um|o) erro|a[cç][aã]o (errada|incorreta|inadequada))\b/i,
    /\b(puxou|empurrou|virou|girou|aumentou|reduziu|selecionou|escolheu|apertou)\b.*\b((o|a) (errad[oa]|incorret[oa]|inadequad[oa]|equivocad[oa])|erradamente|incorretamente)\b/i,
  ],
  physicalActionLimitation: [
    /\b(unable physically|physical limitation|ergonomic|could not reach|fatigue|incapacitated)\b/i,
    /\b(in[aá]bil fisicamente|limita[cç][aã]o f[ií]sica|ergon[oô]mic[ao]|n[aã]o alcan[cç]ou|fadiga|incapacitad[ao])\b/i,
    /\b(cansad[ao]|exaust[ao]|esgotad[ao]|extenuad[ao]|fatigad[ao]|sem for[cç]as?|enfraquecid[ao])\b/i,
    /\b(exhausted|worn out|drained|weakened|debilitated|impaired physically)\b/i,
  ],
  actionKnowledgeLimitation: [
    /\b(training|skill|unfamiliar|knowledge gap|did not know how|not trained)\b/i,
    /\b(treinamento|habilidade|n[aã]o familiar|lacuna de conhecimento|n[aã]o sabia como|n[aã]o treinad[ao])\b/i,
    /\b(n[aã]o) (sabia|conhecia|dominava|entendia|compreendia)\b.*\b(como|o que|qual|quando|onde|por que)\b.*\b(fazer|agir|proceder|reagir|responder|executar|realizar|operar|acionar|usar|utilizar)\b/i,
    /\b(did not know|didn't know|was unsure|was uncertain)\b.*\b(how to|what to|which|when to|where to)\b/i,
  ],
  actionCapabilityPresent: [
    /\b(had the skill|trained|qualified|capable of responding|able to act|capability was present)\b/i,
    /\b(tinha habilidade|treinad[ao]|qualificad[ao]|capaz de responder|capaz de agir|capacidade presente)\b/i,
    /\b(era|estava|permanecia) (capaz|apt[oa]|habilitad[oa]|preparad[oa]|dispon[ií]vel)\b.*\b(para|de)\b.*\b(agir|atuar|responder|reagir|intervir|corrigir|executar)\b/i,
    /\b(was|could have been) (able|capable|in a position) to\b.*\b(act|respond|react|intervene|correct|execute)\b/i,
  ],
  selectionUnderPressureFailed: [
    /\b(no time to select|selection failed under time pressure|did not select because of time pressure)\b/i,
    /\b(sem tempo para selecionar|sele[cç][aã]o falhou sob press[aã]o de tempo|n[aã]o selecionou por press[aã]o de tempo)\b/i,
    /\b(pressionad[ao]|apressad[ao]|com pressa|sem tempo|em cima da hora)\b.*\b(escolheu|selecionou|optou|decidiu)\b.*\b(errad[ao]|mal|incorret[ao])\b/i,
    /\b(under (time )?pressure|hurried|hasty)\b.*\b(selected|chose|opted|picked|decided on)\b.*\b(wrong|incorrect|inappropriate|unsuitable)\b/i,
  ],
  feedbackUnderPressureFailed: [
    /\b(no time to verify feedback|feedback check skipped under time pressure|did not check feedback because of time pressure)\b/i,
    /\b(sem tempo para verificar feedback|checagem de feedback pulada sob press[aã]o de tempo|n[aã]o checou feedback por press[aã]o de tempo)\b/i,
    /\b(pressionad[ao]|apressad[ao]|com pressa|sem tempo)\b.*\b(n[aã]o) (verificou|checou|confirmou|conferiu|validou)\b/i,
    /\b(under (time )?pressure|hurried|hasty)\b.*\b(did not|failed to|skipped|omitted)\b.*\b(check|verify|confirm|validate|cross-check)\b/i,
  ],
  selectionSubtype: [
    /\b(wrong runway|wrong surface|selected wrong|wrong mode|lined up toward|lined up on|selection error)\b/i,
    /\b(pista errada|superf[ií]cie errada|selecionou errado|modo errado|alinhou para|erro de sele[cç][aã]o)\b/i,
    /\b(escolheu|selecionou|optou|decidiu|apertou|acionou|engatou|inseriu|programou)\b.*\b((o|a) (errad[oa]|incorret[oa]|inadequad[oa]|equivocad[oa])|erradamente|incorretamente)\b/i,
    /\b(erro|falha|engano|equ[ií]voco|confus[aã]o) (de|na|ao) (sele[cç][aã]o|escolha|op[cç][aã]o|decis[aã]o|programa[cç][aã]o|inser[cç][aã]o)\b/i,
  ],
  feedbackSubtype: [
    /\b(readback|communication breakdown|callout|feedback|cross-check)\b/i,
    /\b(readback|colacionamento|falha de comunica[cç][aã]o|callout|feedback|checagem cruzada)\b/i,
    /\b(comunica[cç][aã]o|di[aá]logo|conversa|troca|intera[cç][aã]o|entendimento|coordena[cç][aã]o)\b.*\b(entre|com)\b.*\b(tripula[cç][aã]o|pilotos?|comandante|copiloto|controlador|torre|solo)\b.*\b(falhou|falha|ruim|ru[ií]do|deficiente|prejudicad[ao]|ineficaz|interrompid[ao]|cortad[ao])\b/i,
    /\b(crew|team|cockpit|pilot|copilot|captain|first officer)\b.*\b(communication|coordination|interaction|dialogue)\b.*\b(failure|breakdown|error|problem|issue|poor|ineffective)\b/i,
  ],
  timeManagementAction: [
    /\b(time pressure|rushed|late decision|urgency|schedule pressure)\b/i,
    /\b(press[aã]o de tempo|apressad[ao]|decis[aã]o tardia|urg[eê]ncia|press[aã]o de escala)\b/i,
    /\b(decidiu|optou|resolveu|reagiu|atuou|respondeu)\b.*\b(tarde|tardiamente|em cima da hora|no [uú]ltimo (momento|instante|segundo|minuto))\b/i,
    /\b(hesitou|demorou|levou|esperou)\b.*\b(antes de|para|at[eé])\b.*\b(agir|atuar|decidir|reagir|responder|executar|iniciar)\b/i,
    /\b(hesitated|delayed|waited|paused)\b.*\b(before|until)\b.*\b(acting|responding|reacting|deciding|executing)\b/i,
  ],
  postEscapeOutcome: [
    /\b(crashed|collision|impact|injury|fatal|damage|loss of separation|runway excursion|afterward|subsequently)\b/i,
    /\b(colidiu|colis[aã]o|impacto|ferimento|fatal|dano|perda de separa[cç][aã]o|excurs[aã]o de pista|depois|posteriormente)\b/i,
    /\b(ap[oó]s|depois|em seguida|posteriormente|mais tarde|horas depois|no dia seguinte)\b.*\b((o|a) (acidente|impacto|colis[aã]o|queda|incidente|ocorr[eê]ncia|evento)|aconteceu|ocorreu|sucedeu)\b/i,
  ],
  preconditionAsEscape: [
    /\b(precondition|underlying factor|organizational factor|maintenance context|training context)\b/i,
    /\b(precondi[cç][aã]o|fator subjacente|fator organizacional|contexto de manuten[cç][aã]o|contexto de treinamento)\b/i,
    /\b(fator|condi[cç][aã]o|circunst[aâ]ncia|elemento|aspecto) (organizacional|sist[eê]mic[ao]|estrutural|institucional|corporativ[ao]|latente|subjacent)\b/i,
    /\b(a empresa|a companhia|a organiza[cç][aã]o|o operador|a gest[aã]o)\b.*\b(atribuiu|apontou|concluiu|identificou|determinou)\b.*\b(causa|fator|raz[aã]o|motivo|origem)\b/i,
    /\b(the (company|organization|operator|management|airline))\b.*\b(attributed|concluded|determined|identified|pointed to)\b.*\b(cause|factor|reason|source|origin)\b/i,
  ],
  oeCode: [/\bO-E\b/i],
  inventedQuestion: [
    /\b(reconstructed question|generic question|invented question|approximate question)\b/i,
    /\b(pergunta reconstru[ií]da|pergunta gen[eé]rica|pergunta inventada|pergunta aproximada)\b/i,
  ],
}

export function matchingConceptStatements(statements: string[], concept: SeraEvidenceConcept): string[] {
  const patterns = CONCEPT_PATTERNS[concept]
  return statements.filter((statement) => patterns.some((pattern) => pattern.test(statement)))
}

export function hasConcept(statements: string[], concept: SeraEvidenceConcept): boolean {
  return matchingConceptStatements(statements, concept).length > 0
}

/**
 * Returns true if the concept matches AND the matching statement is not negated.
 * For violation concepts (knownRule, explicitAwareness, consciousDeviation),
 * a negated match is discarded — e.g. "não sabia da regra" should NOT activate knownRule.
 */
export function hasConceptWithoutNegation(statements: string[], concept: SeraEvidenceConcept): boolean {
  const matches = matchingConceptStatements(statements, concept)
  return matches.some((stmt) => !negated(stmt))
}

/**
 * Returns matching statements that are not negated.
 */
export function matchingConceptStatementsWithoutNegation(statements: string[], concept: SeraEvidenceConcept): string[] {
  return matchingConceptStatements(statements, concept).filter((stmt) => !negated(stmt))
}

/**
 * Concept families — groups of related concepts that can be checked together.
 * Useful for evidence composition: if any member of a family is present, the
 * semantic category is considered activated.
 */
export const CONCEPT_FAMILIES: Record<string, SeraEvidenceConcept[]> = {
  violationAwareness: ['knownRule', 'explicitAwareness', 'consciousDeviation'],
  sensoryLimitation: ['sensoryLimitation', 'knowledgeLimitation'],
  informationQuality: ['informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'],
  timePressure: ['attentionPressure', 'timeManagementPressure', 'timeManagementAction'],
  actionError: ['slipLapse', 'incorrectAction', 'selectionSubtype'],
  riskManagement: ['managedRisk', 'unmanagedRisk', 'safeGoal'],
}

/**
 * Returns true if ANY concept in the family is present (negation-aware).
 */
export function hasConceptFamily(statements: string[], family: keyof typeof CONCEPT_FAMILIES): boolean {
  return CONCEPT_FAMILIES[family].some((concept) => hasConceptWithoutNegation(statements, concept))
}

export function collectConceptMatches(statements: string[], concepts: SeraEvidenceConcept[]): SeraConceptMatch[] {
  return concepts.flatMap((concept) =>
    matchingConceptStatements(statements, concept).map((statement) => ({
      statement,
      concept,
    })),
  )
}

/**
 * Contextual window matching — checks if concepts appear in statements within
 * a certain number of sentences of each other. Useful for composed evidence
 * (e.g., knownRule AND explicitAwareness must appear close together).
 *
 * Returns the pair of matching statement indices if found within the window.
 */
export function conceptsWithinWindow(
  statements: string[],
  conceptA: SeraEvidenceConcept,
  conceptB: SeraEvidenceConcept,
  maxDistance: number = 3,
): [number, number] | null {
  const indicesA = statements
    .map((s, i) => (hasConceptWithoutNegation([s], conceptA) ? i : -1))
    .filter((i) => i >= 0)
  const indicesB = statements
    .map((s, i) => (hasConceptWithoutNegation([s], conceptB) ? i : -1))
    .filter((i) => i >= 0)

  for (const a of indicesA) {
    for (const b of indicesB) {
      if (Math.abs(a - b) <= maxDistance) return [a, b]
    }
  }
  return null
}
