import type {
  SeraSemanticDecisionConcept,
  SeraSemanticEvidenceAnnotation,
  SeraSemanticEvidenceRole,
} from "../engine-contract";
import { splitNarrativeIntoSentenceRecords } from "../engine-v0/factual-extraction-helpers";

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasPerceptionSemantics(text: string): boolean {
  return /\b(acredit|achav|achei|pensav|pensei|entend|perceb|reconhec|identific|interpret|confund|julg|sabia|ciente|consciente|via|vi |vimos|believ|thought|understood|perceiv|recogniz|identif|interpret|misidentif|knew|aware|saw)\w*/i.test(
    text,
  );
}

function hasObjectiveSemantics(text: string): boolean {
  return (
    /\b(objetiv|inten[cç][aã]o|pretend|queria|desej|buscava|visava|meta|goal|intent|intended|wanted|aimed)\w*/i.test(
      text,
    ) ||
    /\b(decidi|decidiu|decidiram|decidimos|resolvi|resolveu|resolveram|resolvemos|optei|optou|escolhi|escolheu|preferi|preferiu|preferido|chose|decided|resolved|opted|preferred)\b.{0,180}\b(continuar|prosseguir|tentar|pousar|pouso|aproximar|descer|subir|arremeter|ajudar|continue|proceed|try|land|approach|descend|climb|go-around|help)\b/i.test(
      text,
    ) ||
    /\b(pra|para|a fim de|com o objetivo de|in order to|so as to)\s+(?:ser\s+)?(?:ajudar|proativ|cumprir|pousar|realizar|executar|manter|evitar|atingir|help|complete|land|perform|maintain|avoid|achieve)\w*/i.test(
      text,
    )
  );
}

function hasActionSemantics(text: string): boolean {
  return /\b(tirei|tirou|retirei|retirou|desguarneci|peguei|pegou|puxei|puxou|empurrei|empurrou|movi|moveu|meti|meteu|coloquei|colocou|apliquei|aplicou|desacoplei|desacoplou|selecionei|selecionou|acionei|acionou|executei|executou|continuei|continuou|prossegui|prosseguiu|subi|subiu|desci|desceu|pousei|pousou|arremeti|arremeteu|barra na barra|pitch down|removed|pulled|pushed|moved|put|applied|disengaged|selected|activated|executed|continued|proceeded|climbed|descended|landed)\b/i.test(
    text,
  );
}

function isInvestigatorQuestion(text: string): boolean {
  const t = text.trim();
  return (
    /\?$/.test(t) ||
    /^(?:e\s+)?se\s+voc[eê]s?\b/i.test(t) ||
    /^(?:voc[eê]|o senhor|a senhora)\s+acha\b/i.test(t) ||
    /^(?:pergunta|question)\b/i.test(t)
  );
}

function isRetrospectiveEvaluation(text: string): boolean {
  return /\b(depois de pousad|ap[oó]s o pouso|posteriormente|olhando agora|hoje eu acho|eu acho que eu fiz|depois eu percebi|after landing|after touchdown|looking back|in hindsight)\b/i.test(
    text,
  ) || /\b(?:ele|ela|eu) (?:acredita|acha|considera) que (?:o )?(?:maior|principal) (?:problema|causa|fator)\b/i.test(text);
}

function isPostActionFeedback(text: string): boolean {
  const t = norm(text);
  return /\b(quando eu (?:peguei|puxei|empurrei|acionei|selecionei|fiz|executei).{0,120}(?:senti|percebi|vi) que)\b/.test(t)
    || /\b(percebi|senti|vi) que .{0,100}\b(come[cç]ou|subiu sozinho|desceu sozinho|andou|moveu|mexer)\b/.test(t)
    || /\b(after i (?:selected|pulled|pushed|performed|executed).{0,120}(?:noticed|saw|felt))\b/.test(t);
}

export function trimSemanticLandmarkToEventMoment(text: string): string {
  const cues = [
    /\s*,?\s*(?:e\s+)?a[ií],?\s*quando\s+eu\s+(?:entrei,?\s*quando\s+eu\s+)?fiz\s+o\s+pouso\b/i,
    /\s*,?\s*(?:e\s+)?depois\s+(?:de|que)\b/i,
    /\s*,?\s*(?:e\s+)?ap[oó]s\s+(?:o|a|ter)\b/i,
    /\s*,?\s*(?:e\s+)?quando\s+(?:eu\s+)?(?:pousei|pousamos|tocou|tocamos)\b/i,
  ];
  let cut = -1;
  for (const pattern of cues) {
    const match = pattern.exec(text);
    if (match?.index != null && (cut < 0 || match.index < cut))
      cut = match.index;
  }
  if (cut > 24) {
    const head = text
      .slice(0, cut)
      .trim()
      .replace(/[;,]+$/g, "");
    if (
      hasPerceptionSemantics(head) ||
      hasObjectiveSemantics(head) ||
      hasActionSemantics(head)
    )
      return head;
  }
  return text;
}

function inferPreconditionCategory(
  annotation: SeraSemanticEvidenceAnnotation,
): SeraSemanticEvidenceAnnotation["preconditionCategory"] {
  if (annotation.preconditionCategory) return annotation.preconditionCategory;
  if (!annotation.roles.includes("PRECONDITION")) return null;
  const text = norm(annotation.sourceQuote);
  if (/\b(fadiga|fatigue|cansad\w*|exaust\w*|sonol\w*|drows\w*|final da quinzena|acumulo de dias voados)\b/.test(text)) return "PHYSIOLOGICAL";
  if (/\b(insegur\w*|medo|ansied\w*|stress|estresse|trauma\w*|vies|bias|fixacao|complac\w*)\b/.test(text)) return "PSYCHOLOGICAL";
  if (/\b(outro equipamento|outra aeronave|adaptacao|familiaridade|unfamiliar\w*|treinamento|training|proficiencia)\b/.test(text)) return "TRAINING_SELECTION";
  if (/\b(gradiente de autoridade|prepotencia|assertiv\w*|lideranca|leadership|comunicacao entre|coordenacao|crm)\b/.test(text)) return "SOCIAL";
  if (/\b(lote de peca|defeit\w*|pane|falha tecnica|malfunction|fault|equipamento|equipment)\b/.test(text)) return "EQUIPMENT";
  if (/\b(condicoes meteorolog\w*|visibilidade|chuva|vento|weather|visibility|rain|wind)\b/.test(text)) return "ENVIRONMENT";
  return null;
}

function normalizeOccurrenceScope(
  annotation: SeraSemanticEvidenceAnnotation,
): SeraSemanticEvidenceAnnotation["occurrenceScope"] {
  if (annotation.occurrenceScope !== "PRE_EVENT_CAUSAL_HISTORY")
    return annotation.occurrenceScope;
  const text = norm(annotation.sourceQuote);
  const presentEffect =
    /\b(fez com que|deixou .* a ponto de|levou .* a|motivou .* a|por causa .* (?:decidi|preferi|entendi|achei)|em funcao .* (?:decidi|preferi|entendi|achei))\b/.test(
      text,
    );
  const presentState =
    hasPerceptionSemantics(text) ||
    hasObjectiveSemantics(text) ||
    hasActionSemantics(text);
  return presentEffect && presentState
    ? "CURRENT_EVENT"
    : annotation.occurrenceScope;
}

function augmentConcepts(
  annotation: SeraSemanticEvidenceAnnotation,
): SeraSemanticDecisionConcept[] {
  const text = norm(annotation.sourceQuote);
  const concepts = new Set<SeraSemanticDecisionConcept>(
    annotation.concepts ?? [],
  );
  const wrongTechniqueContrast =
    /\b(quando o certo|o correto|em vez de|ao inves de|instead of|should have|deveria)\b/.test(
      text,
    ) &&
    /\b(barra na barra|pitch down|comando|controle|tecnica|técnica|action|response)\b/.test(
      text,
    );
  const explicitKnownWrong =
    /\b(nunca fiz|nunca havia feito|sempre instrui contra|sempre ensinei contra|sabia que nao devia|knew .* should not|always taught against)\b/.test(
      text,
    );
  if (wrongTechniqueContrast || explicitKnownWrong)
    concepts.add("incorrectAction");
  if (wrongTechniqueContrast || explicitKnownWrong)
    concepts.add("selectionSubtype");
  if (explicitKnownWrong) concepts.add("knownRule");
  if (explicitKnownWrong) concepts.add("explicitAwareness");
  if (
    /\b(teve a atitude que normalmente teria no outro equipamento|como sempre voou uma maquina sem automacao|habitualmente fazia no outro equipamento|usual(?:ly)? used on the other aircraft)\b/.test(
      text,
    )
  ) {
    concepts.add("selectionSubtype");
  }
  if (
    /\b(estava imc|estavam imc|viu que .* imc|vimos que .* imc|seeing .* imc)\b/.test(
      text,
    )
  ) {
    concepts.add("informationAvailableCorrect");
    concepts.add("perceptionCapabilityPresent");
  }
  return [...concepts];
}

function normalizeSemanticActor(
  annotation: SeraSemanticEvidenceAnnotation,
): string | null {
  const text = norm(annotation.sourceQuote);
  const firstPerson = /(?:^|\b)(eu|meu|minha|i|my)\b/.test(text);
  const firstPersonMentalOrAction =
    firstPerson &&
    (hasPerceptionSemantics(text) ||
      hasObjectiveSemantics(text) ||
      hasActionSemantics(text));
  if (
    firstPersonMentalOrAction &&
    annotation.actor &&
    /\b(e|and)\b/.test(norm(annotation.actor))
  ) {
    return "piloto entrevistado";
  }
  return annotation.actor;
}

function validRoles(
  annotation: SeraSemanticEvidenceAnnotation,
): SeraSemanticEvidenceRole[] {
  const text = annotation.sourceQuote;
  const question = isInvestigatorQuestion(text);
  return annotation.roles.filter((role) => {
    if (
      question &&
      [
        "PERCEPTION_STATE",
        "OBJECTIVE_INTENT",
        "ACTION_STRATEGY",
        "PRECONDITION",
        "CRITICAL_UNSAFE_ACT",
        "FIRST_DEPARTURE",
      ].includes(role)
    )
      return false;
    if (role === "PERCEPTION_STATE") return hasPerceptionSemantics(text);
    if (role === "OBJECTIVE_INTENT") return hasObjectiveSemantics(text);
    if (role === "ACTION_STRATEGY")
      return hasActionSemantics(text) || hasObjectiveSemantics(text);
    if (
      (role === "FIRST_DEPARTURE" || role === "CRITICAL_UNSAFE_ACT") &&
      isRetrospectiveEvaluation(text)
    )
      return false;
    return true;
  });
}

function resolveSourceRecord(narrative: string, quote: string) {
  const nq = norm(quote);
  if (!nq) return null;
  for (const record of splitNarrativeIntoSentenceRecords(narrative)) {
    const ns = norm(record.statement);
    if (ns === nq || ns.includes(nq)) return record;
  }
  return null;
}

function semanticPosition(narrative: string, annotation: SeraSemanticEvidenceAnnotation): number {
  const record = resolveSourceRecord(narrative, annotation.sourceQuote);
  if (!record) return Number.MAX_SAFE_INTEGER;
  const sourceNorm = norm(record.statement);
  const quoteNorm = norm(annotation.sourceQuote);
  const offset = Math.max(0, sourceNorm.indexOf(quoteNorm));
  return record.sourceSentenceIndex * 1_000_000 + offset;
}

function enforceV2StructuralIntegrity(args: {
  annotations: SeraSemanticEvidenceAnnotation[];
  narrative: string;
}): SeraSemanticEvidenceAnnotation[] {
  const result: SeraSemanticEvidenceAnnotation[] = [];
  const seen = new Set<string>();

  for (const item of args.annotations) {
    const sourceQuote = item.sourceQuote.trim();
    const source = resolveSourceRecord(args.narrative, sourceQuote);
    if (!source) continue;

    let roles = [...new Set(item.roles)];
    // Investigator questions are not event evidence. This is a provenance/format guard,
    // not a semantic classifier: the model remains responsible for interpreting answers.
    if (isInvestigatorQuestion(sourceQuote)) {
      roles = roles.filter((role) => ![
        "PERCEPTION_STATE", "OBJECTIVE_INTENT", "ACTION_STRATEGY", "PRECONDITION",
        "CRITICAL_UNSAFE_ACT", "FIRST_DEPARTURE", "DIRECT_ACTOR",
      ].includes(role));
    }
    if (!roles.length) continue;

    const sourceAssertion = source.assertionStatus;
    const assertionStatus = sourceAssertion && sourceAssertion !== "AFFIRMED"
      ? sourceAssertion
      : item.assertionStatus;
    const hasPrecondition = roles.includes("PRECONDITION");
    const candidate: SeraSemanticEvidenceAnnotation = {
      ...item,
      sourceQuote,
      sourceSentenceIndex: source.sourceSentenceIndex,
      roles,
      assertionStatus,
      preconditionCategory: hasPrecondition ? item.preconditionCategory ?? null : null,
      preconditionCausalStatus: hasPrecondition ? item.preconditionCausalStatus ?? null : null,
      preconditionCausalTargetQuote: hasPrecondition && item.preconditionCausalStatus === "SOURCE_LINKED"
        ? item.preconditionCausalTargetQuote?.trim() || null
        : null,
      displayInterpretation: roles.some((role) => role === "PERCEPTION_STATE" || role === "OBJECTIVE_INTENT" || role === "ACTION_STRATEGY")
        ? item.displayInterpretation?.trim() || null
        : null,
      concepts: [...new Set(item.concepts ?? [])],
    };
    const key = `${candidate.sourceSentenceIndex}:${norm(candidate.sourceQuote)}:${candidate.roles.join(",")}:${candidate.actor ?? ""}:${candidate.preconditionCategory ?? ""}:${candidate.preconditionCausalStatus ?? ""}:${candidate.preconditionCausalTargetQuote ?? ""}:${candidate.concepts?.join(",") ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  const firstDeparture = result
    .filter((item) => item.assertionStatus === "AFFIRMED" && item.confidence !== "LOW" && item.roles.includes("FIRST_DEPARTURE"))
    .sort((a, b) => semanticPosition(args.narrative, a) - semanticPosition(args.narrative, b))[0];
  if (!firstDeparture) return result;
  const firstPosition = semanticPosition(args.narrative, firstDeparture);
  const firstText = norm(firstDeparture.sourceQuote);

  const normalized = result.map((item) => {
    const position = semanticPosition(args.narrative, item);
    let next = item;
    if (position > firstPosition && item.roles.some((role) => role === "CRITICAL_UNSAFE_ACT" || role === "OUTCOME")) {
      next = { ...next, temporalRelation: "POST_ESCAPE" as const };
    }

    if (next.roles.includes("PRECONDITION")) {
      if (next.preconditionCausalStatus !== "SOURCE_LINKED") {
        next = { ...next, preconditionCausalTargetQuote: null };
      } else {
        const target = next.preconditionCausalTargetQuote?.trim() ?? "";
        const targetRecord = target ? resolveSourceRecord(args.narrative, target) : null;
        const targetText = norm(target);
        // Fail closed: SOURCE_LINKED is only accepted when the model anchors the claimed
        // causal relation to the unique FIRST_DEPARTURE verbatim. A plausible factor or a
        // causal claim aimed at another landmark remains PRESENT_CONTEXT.
        const targetsSelectedFirstDeparture = Boolean(
          targetRecord
          && targetText
          && firstText
          && (targetText === firstText || targetText.includes(firstText)),
        );
        if (!targetsSelectedFirstDeparture) {
          next = {
            ...next,
            preconditionCausalStatus: "PRESENT_CONTEXT" as const,
            preconditionCausalTargetQuote: null,
          };
        }
      }
    }
    return next;
  });

  // Objective is the operational result/goal, not the control/action implementation
  // the actor meant to perform. If the model labels an overlapping implementation-mismatch
  // or procedural-omission span as OBJECTIVE_INTENT without any independent objective
  // concept, fail closed by removing only that objective role. The action evidence remains.
  const objectiveConcepts = new Set([
    "safeGoal", "efficiencyObjective", "consciousDeviation", "routineDeviation",
    "exceptionalDeviation", "managedRisk", "unmanagedRisk",
  ]);
  const objectiveGuarded = normalized.map((item, index) => {
    if (!item.roles.includes("OBJECTIVE_INTENT")) return item;
    if ((item.concepts ?? []).some((concept) => objectiveConcepts.has(concept))) return item;
    const current = norm(item.sourceQuote);
    const overlapsActionImplementation = normalized.some((other, otherIndex) => {
      if (otherIndex === index || other.sourceSentenceIndex !== item.sourceSentenceIndex) return false;
      if (!(other.concepts ?? []).some((concept) => concept === "implementationMismatch" || concept === "proceduralOmission")) return false;
      const actionText = norm(other.sourceQuote);
      return Boolean(current && actionText && (current.includes(actionText) || actionText.includes(current)));
    });
    if (!overlapsActionImplementation) return item;
    const roles = item.roles.filter((role) => role !== "OBJECTIVE_INTENT");
    return { ...item, roles };
  }).filter((item) => item.roles.length > 0);

  // Preserve all source-grounded P/O/A spans. Presentation grammar is handled by the
  // optional displayInterpretation field; evidence spans themselves are never widened or
  // discarded merely to improve prose.

  const deduped: SeraSemanticEvidenceAnnotation[] = [];
  const finalSeen = new Set<string>();
  for (const item of objectiveGuarded) {
    const key = `${item.sourceSentenceIndex}:${norm(item.sourceQuote)}:${item.roles.join(",")}:${item.actor ?? ""}:${item.preconditionCategory ?? ""}:${item.preconditionCausalStatus ?? ""}:${item.preconditionCausalTargetQuote ?? ""}:${item.concepts?.join(",") ?? ""}`;
    if (finalSeen.has(key)) continue;
    finalSeen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export function enforceSemanticEvidenceIntegrity(args: {
  annotations?: SeraSemanticEvidenceAnnotation[] | null;
  narrative: string;
  schemaVersion?: "SERA_SEMANTIC_AI_V1" | "SERA_SEMANTIC_AI_V2" | null;
}): SeraSemanticEvidenceAnnotation[] {
  if (!args.annotations?.length) return [];
  if (args.schemaVersion === "SERA_SEMANTIC_AI_V2") {
    return enforceV2StructuralIntegrity({ annotations: args.annotations, narrative: args.narrative });
  }
  const normalizedNarrative = norm(args.narrative);
  const result: SeraSemanticEvidenceAnnotation[] = [];
  const seen = new Set<string>();

  for (const item of args.annotations) {
    let sourceQuote = item.sourceQuote.trim();
    if (!sourceQuote || !normalizedNarrative.includes(norm(sourceQuote)))
      continue;

    if (
      item.roles.includes("PERCEPTION_STATE") &&
      !isRetrospectiveEvaluation(sourceQuote)
    ) {
      const trimmed = trimSemanticLandmarkToEventMoment(sourceQuote);
      if (
        trimmed !== sourceQuote &&
        normalizedNarrative.includes(norm(trimmed))
      )
        sourceQuote = trimmed;
    }

    let candidate: SeraSemanticEvidenceAnnotation = {
      ...item,
      sourceQuote,
      actor: normalizeSemanticActor({ ...item, sourceQuote }),
      occurrenceScope: normalizeOccurrenceScope({ ...item, sourceQuote }),
      preconditionCategory: inferPreconditionCategory({ ...item, sourceQuote }),
      concepts: augmentConcepts({ ...item, sourceQuote }),
    };
    candidate = { ...candidate, roles: validRoles(candidate) };
    if (!candidate.roles.length) continue;

    if (
      (isRetrospectiveEvaluation(candidate.sourceQuote) || isPostActionFeedback(candidate.sourceQuote)) &&
      candidate.roles.some(
        (role) => role === "PERCEPTION_STATE" || role === "OBJECTIVE_INTENT",
      ) &&
      !candidate.roles.some(
        (role) => role === "CRITICAL_UNSAFE_ACT" || role === "FIRST_DEPARTURE",
      )
    ) {
      candidate = { ...candidate, temporalRelation: "POST_ESCAPE" };
    }

    const key = `${candidate.sourceSentenceIndex}:${candidate.sourceQuote}:${candidate.roles.join(",")}:${candidate.actor ?? ""}:${candidate.preconditionCategory ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
