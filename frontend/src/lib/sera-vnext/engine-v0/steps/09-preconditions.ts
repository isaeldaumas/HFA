import type {
  SeraVNextEngineOutput,
  SeraPreconditionCandidate,
  SeraPreconditionCategory,
} from "../../engine-contract";
import type {
  SeraEvidenceItem,
  SeraEvidenceRelationshipToFailure,
} from "../../evidence";
import { isEvidenceUsableFor } from "../../evidence";
import {
  classifyPreconditionCategory,
  confidenceFromCount,
  pushUnique,
} from "../utils";
import {
  isExplicitOperationalDeviationStatement,
  isExplicitOperationalOmissionStatement,
  isNonCausalDocumentStatement,
  isProcedureReferenceStatement,
  isSystemDescriptionStatement,
} from "../factual-extraction-helpers";
import {
  classifyCanonicalPrecondition,
  mostLikelyPreconditionsForCodes,
  SERA_MOST_LIKELY_PRECONDITIONS,
  SERA_PRECONDITION_META,
  type SeraCanonicalPreconditionCategory,
} from "../../precondition-taxonomy";

const CATEGORY_RULE_ID: Record<string, string> = {
  PHYSICAL_CAPABILITY: "PC-RULE-PHYSICAL_CAPABILITY",
  SENSORY_LIMITATION: "PC-RULE-SENSORY_LIMITATION",
  KNOWLEDGE_TRAINING: "PC-RULE-KNOWLEDGE_TRAINING",
  TIME_PRESSURE: "PC-RULE-TIME_PRESSURE",
  ATTENTION_WORKLOAD_CONTEXT: "PC-RULE-ATTENTION_WORKLOAD_CONTEXT",
  COMMUNICATION_INFORMATION: "PC-RULE-COMMUNICATION_INFORMATION",
  PROCEDURAL_MONITORING: "PC-RULE-PROCEDURAL_MONITORING",
  FEEDBACK_VERIFICATION: "PC-RULE-FEEDBACK_VERIFICATION",
  INTENT_AWARENESS: "PC-RULE-INTENT_AWARENESS",
  TEAM_COORDINATION: "PC-RULE-TEAM_COORDINATION",
  ENVIRONMENTAL_CONTEXT: "PC-RULE-ENVIRONMENTAL_CONTEXT",
  TECHNICAL_CONTEXT: "PC-RULE-TECHNICAL_CONTEXT",
  ORGANIZATIONAL_CONTEXT: "PC-RULE-ORGANIZATIONAL_CONTEXT",
};

const CATEGORY_DESCRIPTION: Record<string, string> = {
  PHYSICAL_CAPABILITY:
    "Condição física ou ergonômica potencialmente relevante para a execução da tarefa.",
  SENSORY_LIMITATION:
    "Condição sensorial potencialmente relevante para a percepção da situação.",
  KNOWLEDGE_TRAINING:
    "Contexto de conhecimento, treinamento, qualificação ou familiaridade sustentado por evidência positiva.",
  TIME_PRESSURE:
    "Restrição temporal operacional explicitamente demonstrada que pode ter aumentado a probabilidade da falha ativa.",
  ATTENTION_WORKLOAD_CONTEXT:
    "Captura de atenção, foco concorrente ou carga de trabalho que pode ter aumentado a probabilidade da falha ativa.",
  COMMUNICATION_INFORMATION:
    "Condição de comunicação ou disponibilidade/qualidade da informação relevante ao evento.",
  PROCEDURAL_MONITORING:
    "Condição de monitoramento ou aplicação procedimental que pode ter favorecido a falha ativa.",
  FEEDBACK_VERIFICATION:
    "Condição relacionada a feedback, cross-check ou verificação de uma ação/informação.",
  INTENT_AWARENESS:
    "Contexto de consciência, intenção ou conhecimento de regra relevante ao objetivo do ator.",
  TEAM_COORDINATION:
    "Condição de coordenação entre membros da equipe que pode ter influenciado a cadeia do evento.",
  ENVIRONMENTAL_CONTEXT:
    "Condição do ambiente operacional que aumentou a complexidade ou exposição, sem constituir por si só a falha ativa.",
  TECHNICAL_CONTEXT:
    "Condição técnica do sistema/equipamento relevante ao contexto causal.",
  ORGANIZATIONAL_CONTEXT:
    "Condição organizacional, de supervisão, recursos ou processo potencialmente contributiva.",
};

const CANONICAL_FALLBACK_BY_OPERATIONAL_CATEGORY: Partial<
  Record<string, SeraCanonicalPreconditionCategory>
> = {
  ENVIRONMENTAL_CONTEXT: "ENVIRONMENT",
  TECHNICAL_CONTEXT: "EQUIPMENT",
  ORGANIZATIONAL_CONTEXT: "ORGANIZATIONAL_CLIMATE",
};

const OPERATIONAL_CATEGORY_BY_CANONICAL: Record<
  SeraCanonicalPreconditionCategory,
  SeraPreconditionCategory
> = {
  PHYSIOLOGICAL: "PHYSICAL_CAPABILITY",
  PSYCHOLOGICAL: "ATTENTION_WORKLOAD_CONTEXT",
  SOCIAL: "TEAM_COORDINATION",
  PHYSICAL_CAPABILITY: "PHYSICAL_CAPABILITY",
  PERSONAL_READINESS: "PHYSICAL_CAPABILITY",
  TRAINING_SELECTION: "KNOWLEDGE_TRAINING",
  QUALIFICATION_AUTHORIZATION: "KNOWLEDGE_TRAINING",
  TIME_PRESSURE: "TIME_PRESSURE",
  OBJECTIVES: "INTENT_AWARENESS",
  EQUIPMENT: "TECHNICAL_CONTEXT",
  WORKSPACE: "ENVIRONMENTAL_CONTEXT",
  ENVIRONMENT: "ENVIRONMENTAL_CONTEXT",
  FORMING_INTENT: "INTENT_AWARENESS",
  COMMUNICATING_INTENT: "COMMUNICATION_INFORMATION",
  MONITORING_SUPERVISION: "PROCEDURAL_MONITORING",
  MISSION: "ORGANIZATIONAL_CONTEXT",
  PROVISION_RESOURCES: "ORGANIZATIONAL_CONTEXT",
  RULES_REGULATIONS: "ORGANIZATIONAL_CONTEXT",
  ORGANIZATIONAL_PROCESS_PRACTICES: "ORGANIZATIONAL_CONTEXT",
  ORGANIZATIONAL_CLIMATE: "ORGANIZATIONAL_CONTEXT",
  OVERSIGHT: "ORGANIZATIONAL_CONTEXT",
};

const PRECONDITION_INVESTIGATION_PROMPT_PT: Record<
  SeraCanonicalPreconditionCategory,
  string
> = {
  PHYSIOLOGICAL:
    "Investigar fadiga, condição fisiológica e fatores de prontidão que poderiam ter afetado o desempenho no ponto de fuga.",
  PSYCHOLOGICAL:
    "Investigar distração, fixação, complacência, estresse ou vieses de processamento presentes antes do ponto de fuga.",
  SOCIAL:
    "Investigar liderança, gradiente de autoridade, assertividade, pressão social e dinâmica de equipe relevantes ao evento.",
  PHYSICAL_CAPABILITY:
    "Investigar limitações físicas, sensoriais ou ergonômicas que poderiam restringir a execução da tarefa.",
  PERSONAL_READINESS:
    "Investigar descanso, prontidão, condição física e mental e demais fatores pessoais anteriores à tarefa.",
  TRAINING_SELECTION:
    "Verificar treinamento, familiaridade, proficiência e experiência específica para a tarefa e situação encontradas.",
  QUALIFICATION_AUTHORIZATION:
    "Verificar qualificação, habilitação e autorização formal aplicáveis à atividade executada.",
  TIME_PRESSURE:
    "Verificar se havia urgência, atraso, janela operacional ou pressão temporal concreta e como ela afetou a tarefa.",
  OBJECTIVES:
    "Verificar clareza, compatibilidade e prioridade dos objetivos da tarefa em relação à operação segura.",
  EQUIPMENT:
    "Verificar condição, confiabilidade, ergonomia e feedback fornecido pelos equipamentos, controles e interfaces usados.",
  WORKSPACE:
    "Verificar acesso, visibilidade, layout e restrições físicas do posto ou espaço de trabalho.",
  ENVIRONMENT:
    "Verificar condições ambientais relevantes, incluindo iluminação, meteorologia, ruído, vibração e outras exposições.",
  FORMING_INTENT:
    "Verificar como objetivos, responsabilidades e prioridades da tarefa foram definidos pela supervisão/gestão.",
  COMMUNICATING_INTENT:
    "Verificar como intenção, objetivos, responsabilidades e alterações foram comunicados e confirmados.",
  MONITORING_SUPERVISION:
    "Verificar quem supervisionava a atividade, quais checagens independentes eram requeridas e se foram executadas e registradas.",
  MISSION:
    "Verificar se a missão/tarefa estava claramente definida, aprovada e compatível com os recursos disponíveis.",
  PROVISION_RESOURCES:
    "Verificar suficiência de pessoal, tempo, ferramentas, informações e demais recursos necessários à tarefa.",
  RULES_REGULATIONS:
    "Verificar adequação, clareza, disponibilidade e aplicação das regras e procedimentos que deveriam atuar como barreira.",
  ORGANIZATIONAL_PROCESS_PRACTICES:
    "Verificar processos, rotinas e práticas organizacionais que estruturavam a execução da atividade.",
  ORGANIZATIONAL_CLIMATE:
    "Investigar cultura, prioridades, tolerância a desvios, reporte e condições organizacionais que moldavam o comportamento.",
  OVERSIGHT:
    "Verificar mecanismos de auditoria, monitoramento, gerenciamento de risco e correção de problemas sistêmicos existentes antes do evento.",
};

const CATEGORY_DESCRIPTION_EN: Record<string, string> = {
  PHYSICAL_CAPABILITY:
    "Physical or ergonomic condition potentially relevant to task execution.",
  SENSORY_LIMITATION:
    "Sensory condition potentially relevant to situation perception.",
  KNOWLEDGE_TRAINING:
    "Knowledge, training, qualification, or familiarity context supported by positive evidence.",
  TIME_PRESSURE:
    "Explicitly demonstrated operational time constraint that may have increased the likelihood of the active failure.",
  ATTENTION_WORKLOAD_CONTEXT:
    "Attention capture, competing focus, or workload that may have increased the likelihood of the active failure.",
  COMMUNICATION_INFORMATION:
    "Communication or information availability/quality condition relevant to the event.",
  PROCEDURAL_MONITORING:
    "Monitoring or procedural-application condition that may have contributed to the active failure.",
  FEEDBACK_VERIFICATION:
    "Condition related to feedback, cross-check, or verification of an action/information.",
  INTENT_AWARENESS:
    "Awareness, intent, or relevant rule-knowledge context related to the actor objective.",
  TEAM_COORDINATION:
    "Coordination condition among team members that may have influenced the event chain.",
  ENVIRONMENTAL_CONTEXT:
    "Operational-environment condition that increased complexity or exposure without itself constituting the active failure.",
  TECHNICAL_CONTEXT:
    "Technical system/equipment condition relevant to the causal context.",
  ORGANIZATIONAL_CONTEXT:
    "Organizational, supervision, resource, or process condition potentially contributory.",
};

function relationshipForEvidence(
  items: SeraEvidenceItem[],
): SeraEvidenceRelationshipToFailure {
  if (
    items.some(
      (item) => item.relationshipToFailure === "CONTEXTUAL_PRECONDITION",
    )
  )
    return "CONTEXTUAL_PRECONDITION";
  if (
    items.some((item) => item.relationshipToFailure === "ENABLING_PRECONDITION")
  )
    return "ENABLING_PRECONDITION";
  if (
    items.some((item) => item.relationshipToFailure === "DIRECT_ESCAPE_POINT")
  )
    return "ENABLING_PRECONDITION";
  return "UNRELATED_OR_UNSUPPORTED";
}

function pushEvidence(
  target: SeraEvidenceItem[],
  item: SeraEvidenceItem,
): void {
  if (!target.some((candidate) => candidate.evidenceId === item.evidenceId))
    target.push(item);
}

function dedupeEvidenceByContainment(
  items: SeraEvidenceItem[],
): SeraEvidenceItem[] {
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const tokens = (value: string) =>
    new Set(
      normalized(value)
        .split(" ")
        .filter((token) => token.length >= 3),
    );
  const nearDuplicate = (left: string, right: string): boolean => {
    const a = normalized(left);
    const b = normalized(right);
    if (a.includes(b) || b.includes(a)) return true;
    const at = tokens(left);
    const bt = tokens(right);
    if (!at.size || !bt.size) return false;
    let shared = 0;
    for (const token of at) if (bt.has(token)) shared += 1;
    return shared / Math.min(at.size, bt.size) >= 0.88;
  };
  const kept: SeraEvidenceItem[] = [];
  // Input order is relevance-ranked. Preserve the strongest-provenance wording when
  // the source report repeats substantially the same evidence with minor variations.
  for (const item of items) {
    if (
      kept.some((candidate) =>
        nearDuplicate(candidate.statement, item.statement),
      )
    )
      continue;
    kept.push(item);
  }
  return kept;
}

function normalizedTokens(text: string): Set<string> {
  const stop = new Set([
    "aeronave",
    "aircraft",
    "tripulacao",
    "tripulação",
    "crew",
    "piloto",
    "pilot",
    "sistema",
    "system",
    "durante",
    "during",
    "após",
    "apos",
    "after",
    "foram",
    "foi",
    "com",
    "sem",
    "para",
  ]);
  return new Set(
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !stop.has(token)),
  );
}

function lexicalOverlap(a: string, b: string): number {
  const left = normalizedTokens(a);
  const right = normalizedTokens(b);
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

type OperationalPhase =
  "DISPATCH" | "MAINTENANCE" | "INFLIGHT" | "APPROACH" | "GROUND" | "GENERIC";

function operationalPhase(text: string): OperationalPhase {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    /\b(despach\w*|dispatch\w*|mel|cco|dov|planejamento|flight planning|antes do despacho|before dispatch)\b/.test(
      normalized,
    )
  )
    return "DISPATCH";
  if (
    /\b(manutenc\w*|maintenance|mecan\w*|mechanic|inspecao pre-voo|preflight inspection|tlb)\b/.test(
      normalized,
    )
  )
    return "MAINTENANCE";
  // Ground/helideck servicing can be described without the word "ground". Keep this
  // episode distinct from an approach/landing episode so evidence from a different human
  // act in the same interview cannot migrate into the selected SERA traversal.
  if (
    /\b(taxi|solo|ground|pushback|estacionamento|parking break|parking brake|papelada|documenta[cç][aã]o de troca|comiss[aá]rio|passageiros?|pedais? de freio|cal[cç]os?|cordas?)\b/.test(
      normalized,
    ) ||
    /\b(desguarnec\w*|tirei|tirou|retirei|retirou)\b.{0,100}\b(coletivo|collective)\b/.test(
      normalized,
    ) ||
    /\b(peguei|pegou)\b.{0,80}\b(papel|papelada|documenta[cç][aã]o)\b/.test(
      normalized,
    )
  )
    return "GROUND";
  if (
    /\b(aproximacao|approach|aproximacao final|final approach|pouso|landing|go-around|arremet)\b/.test(
      normalized,
    )
  )
    return "APPROACH";
  if (
    /\b(subida|climb|cruzeiro|cruise|descida|descent|durante o voo|during the flight|fl\d{2,3}|nivelamento|levelled|leveling|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed|gelo|icing)\b/.test(
      normalized,
    )
  )
    return "INFLIGHT";
  return "GENERIC";
}

function phaseCompatible(anchor: string, candidate: string): boolean {
  const a = operationalPhase(anchor);
  const b = operationalPhase(candidate);
  if (a === "GENERIC" || b === "GENERIC") return true;
  const rank: Record<OperationalPhase, number> = {
    MAINTENANCE: 0,
    DISPATCH: 1,
    GROUND: 2,
    INFLIGHT: 3,
    APPROACH: 4,
    GENERIC: 99,
  };
  return rank[b] <= rank[a];
}

export function runStep09Preconditions(input: {
  factualExtraction: SeraVNextEngineOutput["factualExtraction"];
  escapePoint: SeraVNextEngineOutput["escapePoint"];
  directActor: SeraVNextEngineOutput["directActor"];
  axes: SeraVNextEngineOutput["axes"];
  locale: "pt-BR" | "en";
}): SeraPreconditionCandidate[] {
  const activeFailureCodes = [
    input.axes.perception.proposedCode,
    input.axes.objective.proposedCode,
    input.axes.action.proposedCode,
  ].filter(
    (code): code is string =>
      Boolean(code) && !["P-A", "O-A", "A-A"].includes(code as string),
  );
  const causalBoundaryResolved =
    input.escapePoint.status !== "INSUFFICIENT_EVIDENCE" &&
    input.escapePoint.status !== "NO_HUMAN_ESCAPE_POINT" &&
    input.escapePoint.confidence !== "LOW" &&
    input.directActor.status === "IDENTIFIED";
  const mostLikelyCanonical =
    mostLikelyPreconditionsForCodes(activeFailureCodes);
  // Hendy Table 1 is the investigation route after the active failure is known.
  // Preserve its order across P/O/A codes so the engine explicitly evaluates the likely
  // preconditions before presenting evidence-supported factors outside the table. Annex B
  // still permits other factors, but those remain visibly outside the most-likely set.
  const likelyTraversalOrder: SeraCanonicalPreconditionCategory[] = [];
  for (const code of activeFailureCodes) {
    for (const canonical of SERA_MOST_LIKELY_PRECONDITIONS[code] ?? []) {
      if (!likelyTraversalOrder.includes(canonical))
        likelyTraversalOrder.push(canonical);
    }
  }
  const likelyTraversalIndex = new Map(
    likelyTraversalOrder.map((canonical, index) => [canonical, index]),
  );
  const categoryEvidence: Record<
    string,
    {
      texts: string[];
      sourceEvidence: SeraEvidenceItem[];
      investigationOnly: boolean;
      explicitInvestigationSupport: boolean;
      rejectedByInvestigation: boolean;
    }
  > = {};
  const escapeAnchorText = [
    input.escapePoint.firstDepartureCandidate,
    input.escapePoint.criticalUnsafeActCandidate,
    input.escapePoint.statement,
    ...input.escapePoint.supportingEvidence,
  ]
    .filter(Boolean)
    .join(" ");
  const escapeIndexes = input.factualExtraction.evidence
    .filter((item) =>
      input.escapePoint.supportingEvidence.includes(item.statement),
    )
    .map((item) => item.sourceSentenceIndex);
  const explicitCausalLinkToSelectedFailure = (
    item: SeraEvidenceItem,
  ): boolean => {
    const text = item.statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const explicitLink =
      /\b(contribuiu|contribuinte|tornou .* mais provavel|maior problema .* (?:nao )?(?:foi|era)|fez com que|deixou .* a ponto de|levou .* a|motivou .* a|por conta d[aeo]|devido a|because of|contributed|made .* more likely|led .* to|caused .* to|normalmente teria no outro equipamento|atitude que .* tinha da outra aeronave|como sempre voou .* sem automacao)\b/.test(
        text,
      );
    if (explicitLink) return true;
    const sameActor = item.actorRelation === "DIRECT_ACTOR";
    const nearAnchor = escapeIndexes.some(
      (index) => Math.abs(index - item.sourceSentenceIndex) <= 10,
    );
    const topical = escapeAnchorText
      ? lexicalOverlap(item.statement, escapeAnchorText)
      : 0;
    return (
      sameActor &&
      item.semanticConfidence === "HIGH" &&
      nearAnchor &&
      topical >= 2
    );
  };
  const contextRelevance = (item: SeraEvidenceItem): number => {
    let score = item.sourceSection === "FACTUAL" ? 2 : 0;
    if (item.occurrenceScope === "CURRENT_EVENT") score += 6;
    else if (item.occurrenceScope === "PRE_EVENT_CAUSAL_HISTORY") score += 2;
    else if (item.occurrenceScope === "HISTORICAL_COMPARATOR") score -= 100;
    if (
      item.temporalRelation === "PRE_ESCAPE" ||
      item.temporalRelation === "AT_ESCAPE"
    )
      score += 2;
    const overlap = escapeAnchorText
      ? lexicalOverlap(item.statement, escapeAnchorText)
      : 0;
    score += Math.min(overlap, 3) * 2;
    if (
      escapeIndexes.some(
        (index) => Math.abs(index - item.sourceSentenceIndex) <= 10,
      )
    )
      score += 3;
    return score;
  };
  const hasResolvedEscapeAnchor =
    input.escapePoint.status !== "INSUFFICIENT_EVIDENCE" &&
    Boolean(input.escapePoint.statement);
  const primaryEscapeAnchor =
    input.escapePoint.firstDepartureCandidate ??
    input.escapePoint.statement ??
    input.escapePoint.earliestCandidate ??
    input.escapePoint.criticalUnsafeActCandidate ??
    input.escapePoint.latestCandidate ??
    "";
  const isContextualAnalysisStatement = (statement: string): boolean =>
    !isNonCausalDocumentStatement(statement) &&
    !isProcedureReferenceStatement(statement) &&
    !isSystemDescriptionStatement(statement);
  const isSeparateActiveFailure = (item: SeraEvidenceItem): boolean => {
    // A source sentence may explicitly connect a contextual factor to the selected act
    // while also describing the resulting decision. Preserve that causal evidence when
    // the semantic layer marked it as PRECONDITION; phase compatibility still prevents
    // a different operational episode from migrating into this traversal.
    if (
      item.semanticRoles?.includes("PRECONDITION") &&
      explicitCausalLinkToSelectedFailure(item)
    )
      return false;
    return (
      isExplicitOperationalOmissionStatement(item.statement) ||
      isExplicitOperationalDeviationStatement(item.statement)
    );
  };
  const isTechnicalReferenceNoise = (statement: string): boolean => {
    const text = statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    // Descriptions of how a system generally behaves, catalogue/table prose and explanatory
    // aerodynamics are not preconditions merely because they mention equipment, icing or
    // monitoring. Preconditions require an event-specific state or circumstance, not a manual.
    return (
      /^(?:a )?tabela \d+ .*\b(apresenta|resume|contem)\b/.test(text) ||
      /^(?:tal|esse|este) fenomeno ocorre quando\b/.test(text) ||
      /\b(estaria disponivel|seria disponibilizado|ficaria aces[ao]|comecaria a piscar|poderia entao ativar|podiam entao ativar)\b/.test(
        text,
      ) ||
      /\b(de acordo com (?:o )?(?:fabricante|manual|fcom|qrh|catalogo)|conforme (?:o )?(?:fabricante|manual|fcom|qrh|catalogo))\b/.test(
        text,
      ) ||
      /\b(dados tecnicos do catalogo|technical catalogue data|catalogo de pecas|parts catalogue)\b/.test(
        text,
      ) ||
      /^(?:tratava-se|tratava se) de (?:um|uma) \b(sensor|sistema|dispositivo|componente)\b/.test(
        text,
      ) ||
      /^(?:comando|sistema|sensor|atuador|painel|luz|alerta)\b.{0,120}\b(era|consistia|funcionava|operava|atuava)\b/.test(
        text,
      ) ||
      /^(?:o|a) (?:seu|sua) \b(comandamento|acionamento|funcionamento|opera[cç][aã]o)\b.*\b(era realizado|era efetuado|ocorria|funcionava)\b/.test(
        text,
      ) ||
      (/\b(quando|whenever)\b/.test(text) &&
        /\b(fosse|fossem|would be|would remain|would illuminate)\b/.test(
          text,
        ) &&
        /\b(sistema|luz|alerta|de-icing|anti-icing|boots?)\b/.test(text))
    );
  };
  const isInvestigatorConclusionStatement = (statement: string): boolean =>
    /\b(a comiss[aã]o (?:de investiga[cç][aã]o )?(?:sipaer )?(?:considerou|concluiu|entendeu|avaliou)|a investiga[cç][aã]o (?:considerou|concluiu|entendeu)|the (?:investigation|commission) (?:considered|concluded|assessed))\b/i.test(
      statement,
    );

  const isActualEnvironmentalCondition = (statement: string): boolean => {
    const text = statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const hazardousCondition =
      /\b(condi[cç][oõ]es? meteorolog|weather|severe icing|sev ice|gelo severo|forma[cç][aã]o de gelo|ac[uú]mulo de gelo|vento|wind|chuva|rain|nevoa|fog|visibilidade|visibility|nuvem|cloud)\b/.test(
        text,
      );
    const spatialCondition =
      /\b(proximidade|dist[aâ]ncia)\b.{0,80}\b(unidades?|plataformas?|pistas?|destinos?|aer[oó]dromos?|helipontos?)\b/.test(
        text,
      ) ||
      /\b(unidades?|plataformas?|pistas?|destinos?|aer[oó]dromos?|helipontos?)\b.{0,80}\b(pr[oó]xim[oa]s?|adjacent|nearby)\b/.test(
        text,
      );
    const negatedHazard =
      /\b(n[aã]o houve|sem|livre d[aeo]s?|aus[eê]ncia de|no |without )\b.{0,45}\b(ac[uú]mulo de gelo|gelo|icing|weather|vento|wind|chuva|rain|nevoa|fog|nuvem|cloud)\b/.test(
        text,
      );
    const hypotheticalOnly =
      /\b(eventual|hipot[eé]tic|se .* fosse|caso .* ocorresse|would|could)\b/.test(
        text,
      );
    const assertedEventState =
      /\b(houve|ocorreu|ocorreram|foi observad[oa]|foram observad[oa]s|foi detectad[oa]|foram detectad[oa]s|detectou|detectaram|indicou|indicaram|atingiu|atingiram|permaneceu|permaneceram|configurava|configuravam|estava|estavam|eram|era propici|encontrou|encontraram|encountered|experienced|was present|were present|conditions were|weather was)\b/.test(
        text,
      );
    return (
      (spatialCondition ||
        (hazardousCondition &&
          assertedEventState &&
          !negatedHazard &&
          !hypotheticalOnly)) &&
      !/\b(luz|painel|sensor|detector|stick pusher|stick shaker|aoa|manual|afm|qrh|fcom|procedimento|procedure)\b/.test(
        text,
      )
    );
  };
  const isActualTechnicalCondition = (statement: string): boolean => {
    const text = statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return (
      /\b(fault|malfunction|pane|falha t[eé]cnica|inoperante|inoperative|avaria|airframe fault|de-icing.*falh|falh.*de-icing)\b/.test(
        text,
      ) &&
      /\b(system|sistema|equipment|equipamento|de-icing|airframe|sensor|motor|engine|rudder|leme|trim|automation|automacao)\b/.test(
        text,
      )
    );
  };

  const isActualOrganizationalCondition = (statement: string): boolean => {
    const text = statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const adverseProcess =
      /\b(cultura|culture|ausencia de registro|sem registro|without (?:a )?record|registro formal.*(?:nao|ausen|falt)|formal record.*(?:absent|missing)|supervisao inadequada|inadequate supervision|degraded supervision|pressao organizacional|organizational pressure|staffing|efetivo reduzido|processo organizacional|organizational process)\b/.test(
        text,
      );
    const knownButUnrecorded =
      /\b(equipe de manutencao|maintenance team|turno noturno|night shift)\b/.test(
        text,
      ) &&
      /\b(comunicacao verbal|verbal communication|tomaram conhecimento|took notice|were informed)\b/.test(
        text,
      );
    const recordGap =
      /\b(tlb|registro formal|formal record)\b/.test(text) &&
      /\b(nao estava reportad[ao]s?|nao possuia registro|nao havia registro|ausencia de registro|sem registro|not reported|no record|without (?:a )?record|missing record)\b/.test(
        text,
      );
    return adverseProcess || knownButUnrecorded || recordGap;
  };

  const isHighLevelInvestigationFinding = (statement: string): boolean => {
    const text = statement
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return (
      /^(?:[a-z]\)\s*)?o operador possuia um contexto organizacional com multiplas vulnerabilidades/.test(
        text,
      ) ||
      /^(?:[a-z]\)\s*)?havia uma cultura de ausencia de registro formal no tlb que impedia/.test(
        text,
      )
    );
  };

  const displayPreconditionStatement = (
    category: string,
    statement: string,
  ): string => {
    const text = statement.trim();
    if (category === "ENVIRONMENTAL_CONTEXT") {
      const environmentalClause = text.match(
        /(?:durante|em)\s+(?:a\s+)?(?:fase de )?(?:cruzeiro|voo|opera[cç][aã]o)[^.;]{0,120}?(?:encontrou|operava|estava)[^.;]{0,220}?(?:gelo|icing|meteorolog)[^.;]*/i,
      );
      if (environmentalClause)
        return (
          environmentalClause[0].trim().replace(/^[,;:\- ]+/, "") +
          (/[.!?]$/.test(environmentalClause[0].trim()) ? "" : ".")
        );
    }
    if (category === "ORGANIZATIONAL_CONTEXT") {
      const recordClause = text.match(
        /(?:a pane[^.;]{0,160}?n[aã]o estava reportada no TLB|a aeronave[^.;]{0,160}?n[aã]o possu[ií]a registro[^.;]{0,100}?TLB|n[aã]o havia registro formal[^.;]{0,120}?TLB)/i,
      );
      if (recordClause)
        return (
          recordClause[0].trim().replace(/^[,;:\- ]+/, "") +
          (/[.!?]$/.test(recordClause[0].trim()) ? "" : ".")
        );
    }
    return text;
  };

  const categoryForPreconditionStatement = (
    statement: string,
    semanticCanonical?: SeraCanonicalPreconditionCategory | null,
  ): SeraPreconditionCategory | null => {
    if (semanticCanonical)
      return OPERATIONAL_CATEGORY_BY_CANONICAL[semanticCanonical];
    // Organizational recording/culture evidence must not migrate to Equipment merely because
    // the same sentence names the technical fault that should have been recorded.
    if (isActualOrganizationalCondition(statement))
      return "ORGANIZATIONAL_CONTEXT";
    return classifyPreconditionCategory({
      text: statement,
      proposedCode: null,
    });
  };

  const hasSemanticInterpretation = input.factualExtraction.evidence.some(
    (item) =>
      item.collectionSource === "AI_SEMANTIC_EXTRACTION" &&
      item.semanticConfidence !== "LOW",
  );
  const contextualEvidence = input.factualExtraction.evidence
    .filter((item) => item.occurrenceScope !== "HISTORICAL_COMPARATOR")
    // Once the semantic pass exists, use it as the primary interpretation layer. Raw
    // lexical/regex matches remain a fallback only when semantic enrichment is absent;
    // otherwise a word such as "vento", "treinamento" or "sistema" can create an
    // unrelated precondition from another episode of the same interview.
    .filter(
      (item) =>
        !hasSemanticInterpretation ||
        item.collectionSource === "AI_SEMANTIC_EXTRACTION" ||
        item.collectionSource === "CLARIFICATION_RESPONSE",
    )
    .filter((item) => isEvidenceUsableFor(item, "PRECONDITION"))
    .filter((item) => isContextualAnalysisStatement(item.statement))
    .filter((item) => !isInvestigatorConclusionStatement(item.statement))
    .filter((item) => !isHighLevelInvestigationFinding(item.statement))
    .filter((item) => !isTechnicalReferenceNoise(item.statement))
    // Hendy separation: another observable unsafe act/omission is not automatically a precondition
    // of the selected critical act. It needs its own SERA traversal unless separate causal evidence
    // explicitly establishes it as a precondition.
    .filter((item) => !isSeparateActiveFailure(item))
    .filter(
      (item) =>
        !hasResolvedEscapeAnchor ||
        phaseCompatible(primaryEscapeAnchor, item.statement),
    )
    .filter((item) => !hasResolvedEscapeAnchor || contextRelevance(item) >= 3)
    .sort(
      (a, b) =>
        contextRelevance(b) - contextRelevance(a) ||
        a.sourceSentenceIndex - b.sourceSentenceIndex,
    );
  const explicitContributorEvidence = input.factualExtraction.evidence.filter(
    (item) =>
      item.sourceSection === "REPORT_ANALYSIS" &&
      item.assertionStatus === "AFFIRMED" &&
      item.supports.includes("PRECONDITION") &&
      isContextualAnalysisStatement(item.statement) &&
      /\b(contribuiu|contribuinte|contributed|contributory|falha na barreira|aus[eê]ncia da reconfirma[cç][aã]o|n[aã]o havendo a reconfirma[cç][aã]o)\b/i.test(
        item.statement,
      ),
  );
  const investigationIndicatedEvidence =
    input.factualExtraction.evidence.filter(
      (item) =>
        item.sourceSection === "REPORT_ANALYSIS" &&
        item.assertionStatus === "AFFIRMED" &&
        item.supports.includes("PRECONDITION") &&
        isContextualAnalysisStatement(item.statement) &&
        /\b(supervis[aã]o|supervision|coordena[cç][aã]o|coordination|organizacional|organizational|reconfirma[cç][aã]o|c[oó]digo 9p|cross-check|monitoramento inadequad|monitoring inadequat|aus[eê]ncia de monitoramento|lack of monitoring)\b/i.test(
          item.statement,
        ),
    );
  const rejectedEvidence = input.factualExtraction.evidence.filter(
    (item) => item.assertionStatus === "REJECTED_AS_FACTOR",
  );

  for (const item of contextualEvidence) {
    const category = categoryForPreconditionStatement(
      item.statement,
      item.semanticPreconditionCategory,
    );
    if (!category) continue;
    const semanticPrecondition =
      item.semanticSource === "AI_SEMANTIC_EXTRACTION" &&
      Boolean(item.semanticPreconditionCategory) &&
      item.semanticConfidence !== "LOW";
    if (
      category === "ENVIRONMENTAL_CONTEXT" &&
      !semanticPrecondition &&
      !isActualEnvironmentalCondition(item.statement)
    )
      continue;
    if (
      category === "TECHNICAL_CONTEXT" &&
      !semanticPrecondition &&
      !isActualTechnicalCondition(item.statement)
    )
      continue;
    // A technical fault is not a precondition merely because it occurred on the same aircraft.
    // Require semantic linkage to the Hendy causal window; explicit investigator-supported
    // contributors are handled separately below.
    if (category === "TECHNICAL_CONTEXT" && !semanticPrecondition) {
      const nearEscapeAnchor = escapeIndexes.some(
        (index) => Math.abs(index - item.sourceSentenceIndex) <= 10,
      );
      if (
        lexicalOverlap(item.statement, escapeAnchorText) < 2 &&
        !nearEscapeAnchor
      )
        continue;
    }
    if (
      category === "ORGANIZATIONAL_CONTEXT" &&
      !semanticPrecondition &&
      !isActualOrganizationalCondition(item.statement)
    )
      continue;
    categoryEvidence[category] ||= {
      texts: [],
      sourceEvidence: [],
      investigationOnly: true,
      explicitInvestigationSupport: false,
      rejectedByInvestigation: false,
    };
    // A semantic label is not itself proof of causality. Promote a contextual factor to an
    // evidenced precondition only when the source links it to the selected active failure.
    // Otherwise preserve it as an investigation hypothesis (e.g. a parallel equipment fault).
    if (explicitCausalLinkToSelectedFailure(item))
      categoryEvidence[category].investigationOnly = false;
    pushUnique(categoryEvidence[category].texts, item.statement);
    pushEvidence(categoryEvidence[category].sourceEvidence, item);
  }

  for (const item of explicitContributorEvidence) {
    const category = categoryForPreconditionStatement(
      item.statement,
      item.semanticPreconditionCategory,
    );
    if (!category) continue;
    const existing = categoryEvidence[category];
    const independentlySupported =
      existing?.sourceEvidence.some((candidate) =>
        isEvidenceUsableFor(candidate, "PRECONDITION"),
      ) ?? false;
    categoryEvidence[category] ||= {
      texts: [],
      sourceEvidence: [],
      investigationOnly: true,
      explicitInvestigationSupport: false,
      rejectedByInvestigation: false,
    };
    // Investigator conclusions may corroborate independently observed event facts, but they
    // must not be displayed or counted as the primary causal evidence for that precondition.
    if (independentlySupported) {
      categoryEvidence[category].explicitInvestigationSupport = true;
      continue;
    }
    pushUnique(categoryEvidence[category].texts, item.statement);
    pushEvidence(categoryEvidence[category].sourceEvidence, item);
  }

  for (const item of investigationIndicatedEvidence) {
    const category = categoryForPreconditionStatement(
      item.statement,
      item.semanticPreconditionCategory,
    );
    if (!category) continue;
    const existing = categoryEvidence[category];
    if (
      existing &&
      !existing.investigationOnly &&
      existing.sourceEvidence.length > 0
    )
      continue;
    categoryEvidence[category] ||= {
      texts: [],
      sourceEvidence: [],
      investigationOnly: true,
      explicitInvestigationSupport: false,
      rejectedByInvestigation: false,
    };
    pushUnique(categoryEvidence[category].texts, item.statement);
    pushEvidence(categoryEvidence[category].sourceEvidence, item);
  }

  for (const item of rejectedEvidence) {
    const category = categoryForPreconditionStatement(
      item.statement,
      item.semanticPreconditionCategory,
    );
    if (category && categoryEvidence[category])
      categoryEvidence[category].rejectedByInvestigation = true;
  }

  const canonicalProfileFor = (
    category: string,
    evidenceSet: (typeof categoryEvidence)[string],
  ) => {
    const canonicalCounts = new Map<
      SeraCanonicalPreconditionCategory,
      number
    >();
    const causalEvidence = evidenceSet.sourceEvidence.filter((item) =>
      isEvidenceUsableFor(item, "PRECONDITION"),
    );
    const evidenceForCanonicalization = causalEvidence.length
      ? causalEvidence
      : evidenceSet.sourceEvidence;
    for (const item of evidenceForCanonicalization) {
      const canonical =
        item.semanticPreconditionCategory ??
        classifyCanonicalPrecondition(item.statement);
      if (canonical)
        canonicalCounts.set(
          canonical,
          (canonicalCounts.get(canonical) ?? 0) + 1,
        );
    }
    const fallbackCanonical =
      CANONICAL_FALLBACK_BY_OPERATIONAL_CATEGORY[category] ?? null;
    const countedCanonical =
      [...canonicalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;
    const incompatibleWithOperationalCategory =
      (category === "TECHNICAL_CONTEXT" &&
        countedCanonical === "ENVIRONMENT") ||
      (category === "ENVIRONMENTAL_CONTEXT" &&
        countedCanonical === "EQUIPMENT") ||
      (category === "ORGANIZATIONAL_CONTEXT" &&
        ["ENVIRONMENT", "EQUIPMENT"].includes(countedCanonical ?? ""));
    const canonicalCategory = incompatibleWithOperationalCategory
      ? fallbackCanonical
      : (countedCanonical ?? fallbackCanonical);
    const likelyForActiveFailureCodes = canonicalCategory
      ? activeFailureCodes.filter((code) =>
          (SERA_MOST_LIKELY_PRECONDITIONS[code] ?? []).includes(
            canonicalCategory,
          ),
        )
      : [];
    return { canonicalCategory, likelyForActiveFailureCodes };
  };

  const confidenceFor = (
    category: string,
    evidenceSet: (typeof categoryEvidence)[string],
  ) => {
    const capAtEscape = <T extends "LOW" | "MEDIUM" | "HIGH">(
      value: T,
    ): T | "LOW" | "MEDIUM" | "HIGH" => {
      const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
      return rank[value] <= rank[input.escapePoint.confidence]
        ? value
        : input.escapePoint.confidence;
    };
    if (!causalBoundaryResolved) return "LOW" as const;
    if (
      evidenceSet.rejectedByInvestigation &&
      !evidenceSet.explicitInvestigationSupport
    )
      return "LOW" as const;
    if (evidenceSet.explicitInvestigationSupport)
      return capAtEscape(
        evidenceSet.sourceEvidence.length >= 2
          ? ("HIGH" as const)
          : ("MEDIUM" as const),
      );
    if (evidenceSet.investigationOnly) return "LOW" as const;
    const base = confidenceFromCount(evidenceSet.texts.length);
    const canonical = canonicalProfileFor(
      category,
      evidenceSet,
    ).canonicalCategory;
    const outsideLikely =
      canonical &&
      activeFailureCodes.length > 0 &&
      !mostLikelyCanonical.has(canonical);
    if (outsideLikely && base === "HIGH") return capAtEscape("MEDIUM" as const);
    return capAtEscape(
      category === "ATTENTION_WORKLOAD_CONTEXT" && base === "HIGH"
        ? ("MEDIUM" as const)
        : base,
    );
  };

  const evidencedCandidates = Object.entries(categoryEvidence).map(
    ([category, evidenceSet]): SeraPreconditionCandidate => {
      const canonicalProfile = canonicalProfileFor(category, evidenceSet);
      const usableCausalEvidence = evidenceSet.sourceEvidence.filter((item) =>
        isEvidenceUsableFor(item, "PRECONDITION"),
      );
      const evidenceForDisplay = usableCausalEvidence.length
        ? usableCausalEvidence
        : evidenceSet.sourceEvidence;
      const resolvedRelationship: SeraEvidenceRelationshipToFailure =
        !causalBoundaryResolved
          ? "UNRELATED_OR_UNSUPPORTED"
          : evidenceSet.rejectedByInvestigation &&
              !evidenceSet.explicitInvestigationSupport
            ? "UNRELATED_OR_UNSUPPORTED"
            : evidenceSet.explicitInvestigationSupport
              ? "CONTEXTUAL_PRECONDITION"
              : evidenceSet.investigationOnly
                ? "UNRELATED_OR_UNSUPPORTED"
                : relationshipForEvidence(
                    usableCausalEvidence.length
                      ? usableCausalEvidence
                      : evidenceSet.sourceEvidence,
                  );
      const rankedSourceEvidence = dedupeEvidenceByContainment(
        [...evidenceForDisplay].sort(
          (a, b) =>
            contextRelevance(b) - contextRelevance(a) ||
            a.sourceSentenceIndex - b.sourceSentenceIndex,
        ),
      ).slice(0, 5);
      const rankedTexts = rankedSourceEvidence.length
        ? [
            ...new Set(
              rankedSourceEvidence.map((item) =>
                displayPreconditionStatement(category, item.statement),
              ),
            ),
          ].slice(0, 5)
        : [
            ...new Set(
              evidenceSet.texts.map((text) =>
                displayPreconditionStatement(category, text),
              ),
            ),
          ].slice(0, 5);
      return {
        id: `PC-EVIDENCE-${category}`,
        label: category,
        description: !causalBoundaryResolved
          ? input.locale === "pt-BR"
            ? "Contexto preservado como hipótese não causal porque o ponto de fuga ou o ator direto ainda não está resolvido com evidência suficiente."
            : "Context retained as a non-causal hypothesis because the escape point or direct actor is not yet resolved with sufficient evidence."
          : evidenceSet.rejectedByInvestigation &&
              !evidenceSet.explicitInvestigationSupport
            ? input.locale === "pt-BR"
              ? "Há evidência contextual nesta categoria, mas a investigação de origem também registra fator equivalente como não contribuinte; mantido apenas como hipótese, sem confirmação causal."
              : "There is contextual evidence in this category, but the source investigation also records an equivalent factor as non-contributory; retained only as a hypothesis, without causal confirmation."
            : evidenceSet.investigationOnly &&
                !evidenceSet.explicitInvestigationSupport
              ? input.locale === "pt-BR"
                ? "Fator indicado pela investigação, preservado como hipótese contextual e não confirmado como pré-condição causal."
                : "Factor indicated by the investigation, retained as a contextual hypothesis and not confirmed as a causal precondition."
              : canonicalProfile.canonicalCategory
                ? input.locale === "pt-BR"
                  ? SERA_PRECONDITION_META[canonicalProfile.canonicalCategory]
                      .definitionPt
                  : SERA_PRECONDITION_META[canonicalProfile.canonicalCategory]
                      .definitionEn
                : input.locale === "pt-BR"
                  ? (CATEGORY_DESCRIPTION[category] ??
                    "Pré-condição candidata sustentada por evidência e mantida separada do ponto de fuga e da falha ativa.")
                  : (CATEGORY_DESCRIPTION_EN[category] ??
                    "Candidate precondition supported by evidence and kept separate from the escape point and active failure."),
        category: category as SeraPreconditionCandidate["category"],
        evidence: rankedTexts,
        relationship: resolvedRelationship,
        sourceEvidence: rankedSourceEvidence,
        sourceRuleIds: canonicalProfile.canonicalCategory
          ? [
              `SERA-HENDY-ANNEX-B-${canonicalProfile.canonicalCategory}`,
              ...(canonicalProfile.likelyForActiveFailureCodes.length
                ? canonicalProfile.likelyForActiveFailureCodes.map(
                    (code) =>
                      `SERA-HENDY-TABLE1-${code}-${canonicalProfile.canonicalCategory}`,
                  )
                : []),
            ]
          : [CATEGORY_RULE_ID[category]],
        linkedActor: causalBoundaryResolved ? input.directActor.actor : null,
        explicitlyNotEscapePoint: true,
        basedOnCandidateCode: false,
        nonFinal: true,
        confidence: confidenceFor(category, {
          ...evidenceSet,
          texts: rankedTexts,
          sourceEvidence: rankedSourceEvidence,
        }),
        canonicalCategory: canonicalProfile.canonicalCategory,
        canonicalLevel: canonicalProfile.canonicalCategory
          ? SERA_PRECONDITION_META[canonicalProfile.canonicalCategory].level
          : null,
        likelyForActiveFailureCodes:
          canonicalProfile.likelyForActiveFailureCodes,
        methodologyMatch:
          !causalBoundaryResolved ||
          !canonicalProfile.canonicalCategory ||
          usableCausalEvidence.length === 0 ||
          resolvedRelationship === "UNRELATED_OR_UNSUPPORTED"
            ? "HYPOTHESIS_ONLY"
            : canonicalProfile.likelyForActiveFailureCodes.length > 0
              ? "MOST_LIKELY_AND_EVIDENCED"
              : "EVIDENCED_OUTSIDE_MOST_LIKELY_SET",
        causalRole:
          resolvedRelationship === "ENABLING_PRECONDITION" ||
          resolvedRelationship === "CONTEXTUAL_PRECONDITION"
            ? "ACTIVE_FAILURE_PRECONDITION"
            : canonicalProfile.canonicalCategory === "EQUIPMENT"
              ? "PARALLEL_TECHNICAL_CONDITION"
              : rankedSourceEvidence.some((item) =>
                    item.semanticRoles?.includes("BARRIER"),
                  )
                ? "BARRIER_FAILURE"
                : canonicalProfile.canonicalCategory === "ENVIRONMENT" &&
                    rankedTexts.length > 0
                  ? "OPERATIONAL_CONTEXT"
                  : "INVESTIGATION_HYPOTHESIS",
      };
    },
  );

  evidencedCandidates.sort((left, right) => {
    const leftIndex = left.canonicalCategory
      ? likelyTraversalIndex.get(left.canonicalCategory)
      : undefined;
    const rightIndex = right.canonicalCategory
      ? likelyTraversalIndex.get(right.canonicalCategory)
      : undefined;
    if (leftIndex !== undefined && rightIndex !== undefined)
      return leftIndex - rightIndex;
    if (leftIndex !== undefined) return -1;
    if (rightIndex !== undefined) return 1;
    return left.label.localeCompare(
      right.label,
      input.locale === "pt-BR" ? "pt-BR" : "en",
    );
  });

  if (!causalBoundaryResolved || activeFailureCodes.length === 0)
    return evidencedCandidates;

  const representedCanonical = new Set(
    evidencedCandidates
      .map((item) => item.canonicalCategory)
      .filter((item): item is SeraCanonicalPreconditionCategory =>
        Boolean(item),
      ),
  );
  const likelyCounts = new Map<SeraCanonicalPreconditionCategory, string[]>();
  for (const code of activeFailureCodes) {
    for (const canonical of SERA_MOST_LIKELY_PRECONDITIONS[code] ?? []) {
      const codes = likelyCounts.get(canonical) ?? [];
      if (!codes.includes(code)) codes.push(code);
      likelyCounts.set(canonical, codes);
    }
  }

  const investigationGaps = [...likelyCounts.entries()]
    .filter(([canonical]) => !representedCanonical.has(canonical))
    .sort(
      (a, b) =>
        (likelyTraversalIndex.get(a[0]) ?? Number.MAX_SAFE_INTEGER) -
        (likelyTraversalIndex.get(b[0]) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([canonical, likelyCodes]): SeraPreconditionCandidate => ({
      id: `PC-INVESTIGATE-${canonical}`,
      label: canonical,
      description:
        input.locale === "pt-BR"
          ? `${PRECONDITION_INVESTIGATION_PROMPT_PT[canonical]} A Tabela 1 de Hendy relaciona esta categoria a ${likelyCodes.join(", ")}, mas ainda não há evidência factual suficiente neste evento para tratá-la como causa.`
          : `${SERA_PRECONDITION_META[canonical].definitionEn} Hendy Table 1 links this category to ${likelyCodes.join(", ")}, but this event does not yet contain sufficient factual evidence to treat it as causal.`,
      category: OPERATIONAL_CATEGORY_BY_CANONICAL[canonical],
      evidence: [],
      relationship: "UNRELATED_OR_UNSUPPORTED",
      sourceEvidence: [],
      sourceRuleIds: likelyCodes.map(
        (code) => `SERA-HENDY-TABLE1-${code}-${canonical}`,
      ),
      linkedActor: input.directActor.actor,
      explicitlyNotEscapePoint: true,
      basedOnCandidateCode: true,
      nonFinal: true,
      confidence: "LOW",
      canonicalCategory: canonical,
      canonicalLevel: SERA_PRECONDITION_META[canonical].level,
      likelyForActiveFailureCodes: likelyCodes,
      methodologyMatch: "HYPOTHESIS_ONLY",
      causalRole: "INVESTIGATION_HYPOTHESIS",
    }));

  return [...evidencedCandidates, ...investigationGaps];
}
