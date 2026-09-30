import type {
  SeraConfidence,
  SeraEvidenceGraph,
  SeraSemanticEvidenceAnnotation,
  SeraSemanticEvidenceRole,
  SeraTrajectoryPhase,
  SeraVNextEngineOutput,
} from "../engine-contract";
import type { SeraEvidenceItem } from "../evidence/types";

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function phaseOf(text: string): SeraTrajectoryPhase {
  const t = norm(text);
  if (
    /\b(despach|dispatch|planejamento de voo|flight planning|cco|dov)\b/.test(t)
  )
    return "DISPATCH";
  if (/\b(manutenc|maintenance|mecan|mechanic|tlb|inspecao pre-voo)\b/.test(t))
    return "MAINTENANCE";
  if (
    /\b(solo|ground|helideck|estacionamento|parking|papelada|documenta[cç][aã]o|comiss[aá]rio|coletivo|collective|cal[cç]os?)\b/.test(
      t,
    )
  )
    return "GROUND";
  if (
    /\b(aproxim|approach|pouso|pousar|landing|go-around|arremet|plataforma|helideck)\b/.test(
      t,
    )
  )
    return "APPROACH";
  if (
    /\b(voo|flight|subida|climb|cruzeiro|cruise|descida|descent|imc|500 pes|700 pes|flight director|diretor de voo)\b/.test(
      t,
    )
  )
    return "INFLIGHT";
  return "GENERIC";
}

function actorKey(actor: string | null): string {
  const value = norm(actor ?? "");
  const hasInterviewed = /piloto entrevistado|interviewed pilot/.test(value);
  const hasOther =
    /outro piloto|other pilot|piloto em adaptacao|comandante em treinamento/.test(
      value,
    );
  if (hasInterviewed && hasOther) return "crew-collective";
  if (hasInterviewed) return "interviewed-pilot";
  if (hasOther) return "other-pilot";
  if (/tripulacao|flight crew|crew collective/.test(value))
    return "crew-collective";
  return value;
}

function signature(text: string): string {
  const t = norm(text);
  if (
    /\b(500 pes|imc)\b.*\b(continu|prossegu|tentar|pous)\b|\b(continu|prossegu)\w*.*\b(imc|500 pes)\b/.test(
      t,
    )
  )
    return "CONTINUE_APPROACH";
  if (
    /\b(barra na barra|pitch down|flight director|diretor de voo|ciclico|coletivo|comandos?)\b/.test(
      t,
    ) &&
    /\b(pux|desacopl|subir|coloc|aplic|contrari)\w*/.test(t)
  )
    return "CONTROL_RESPONSE";
  if (/\b(mao|mão)\b.*\bcoletivo\b|\bpapelada|documenta[cç][aã]o\b/.test(t))
    return "CONTROL_GUARD";
  if (
    /\b(lado|assumir|prefer)\w*.*\bpouso\b|\bpouso\b.*\b(lado|assumir|prefer)\w*/.test(
      t,
    )
  )
    return "LANDING_ASSIGNMENT";
  if (/\b(luz|transmiss)\w*.*\b(chuva|normal|descer|praia)\b/.test(t))
    return "TECHNICAL_RESPONSE";
  return (
    t
      .split(" ")
      .filter((x) => x.length > 4)
      .slice(0, 6)
      .join("_") || "GENERIC"
  );
}

function contextForIndex(
  timeline: SeraVNextEngineOutput["factualExtraction"]["timeline"],
  index: number,
  statement: string,
): string {
  return timeline
    .filter((item) => Math.abs(item.sourceSentenceIndex - index) <= 2)
    .map((item) => item.statement)
    .concat(statement)
    .join(" ");
}

export type SeraTrajectorySeed = {
  statement: string;
  sourceSentenceIndex: number;
  actor: string | null;
  roles: SeraSemanticEvidenceRole[];
  confidence: SeraConfidence;
  phase: SeraTrajectoryPhase;
  selectedForPrimaryPoa: boolean;
  relationToPrimary: "PRIMARY" | "UPSTREAM" | "DOWNSTREAM" | "SAME_EPISODE";
};

export function discoverTrajectorySeeds(args: {
  annotations?: SeraSemanticEvidenceAnnotation[];
  timeline: SeraVNextEngineOutput["factualExtraction"]["timeline"];
  escapePoint: SeraVNextEngineOutput["escapePoint"];
  directActor: SeraVNextEngineOutput["directActor"];
}): SeraTrajectorySeed[] {
  const primaryStatement =
    args.escapePoint.poaAnchorCandidate ??
    args.escapePoint.criticalUnsafeActCandidate ??
    args.escapePoint.statement;
  const primaryIndex =
    args.timeline.find((item) => sameText(item.statement, primaryStatement))
      ?.sourceSentenceIndex ?? null;
  const primaryContext =
    primaryIndex == null || !primaryStatement
      ? ""
      : contextForIndex(args.timeline, primaryIndex, primaryStatement);
  const primaryPhase = phaseOf(primaryContext);
  const raw: SeraTrajectorySeed[] = [];
  const add = (
    statement: string,
    index: number,
    actor: string | null,
    roles: SeraSemanticEvidenceRole[],
    confidence: SeraConfidence,
  ) => {
    if (!statement.trim()) return;
    const selected = sameText(statement, primaryStatement);
    const phase = phaseOf(contextForIndex(args.timeline, index, statement));
    const relationToPrimary = selected
      ? ("PRIMARY" as const)
      : primaryIndex == null
        ? ("SAME_EPISODE" as const)
        : index < primaryIndex
          ? ("UPSTREAM" as const)
          : index > primaryIndex
            ? ("DOWNSTREAM" as const)
            : ("SAME_EPISODE" as const);
    raw.push({
      statement,
      sourceSentenceIndex: index,
      actor,
      roles,
      confidence,
      phase,
      selectedForPrimaryPoa: selected,
      relationToPrimary,
    });
  };

  for (const item of args.annotations ?? []) {
    if (
      item.assertionStatus !== "AFFIRMED" ||
      item.confidence === "LOW" ||
      item.occurrenceScope !== "CURRENT_EVENT"
    )
      continue;
    if (!item.roles.includes("CRITICAL_UNSAFE_ACT")) continue;
    add(
      item.sourceQuote,
      item.sourceSentenceIndex,
      item.actor,
      item.roles,
      item.confidence,
    );
  }
  const fd = args.escapePoint.firstDepartureCandidate;
  if (fd) {
    const idx =
      args.timeline.find((item) => sameText(item.statement, fd))
        ?.sourceSentenceIndex ?? 0;
    const ann = (args.annotations ?? []).find(
      (item) =>
        item.roles.includes("FIRST_DEPARTURE") &&
        sameText(item.sourceQuote, fd),
    );
    add(
      fd,
      idx,
      ann?.actor ?? args.escapePoint.firstDepartureActor ?? null,
      ann?.roles ?? ["FIRST_DEPARTURE"],
      ann?.confidence ?? args.escapePoint.confidence,
    );
  }
  if (primaryStatement) {
    const idx = primaryIndex ?? 0;
    const ann = (args.annotations ?? []).find(
      (item) =>
        item.roles.includes("CRITICAL_UNSAFE_ACT") &&
        sameText(item.sourceQuote, primaryStatement),
    );
    add(
      primaryStatement,
      idx,
      ann?.actor ?? args.directActor.actor,
      ann?.roles ?? ["CRITICAL_UNSAFE_ACT"],
      ann?.confidence ?? args.escapePoint.confidence,
    );
  }

  const compatible = raw.filter((item) => {
    if (item.selectedForPrimaryPoa || item.roles.includes("FIRST_DEPARTURE"))
      return true;
    if (
      primaryIndex != null &&
      Math.abs(item.sourceSentenceIndex - primaryIndex) > 28
    )
      return false;
    return (
      primaryPhase === "GENERIC" ||
      item.phase === "GENERIC" ||
      item.phase === primaryPhase
    );
  });
  compatible.sort(
    (a, b) =>
      Number(b.selectedForPrimaryPoa) - Number(a.selectedForPrimaryPoa) ||
      a.sourceSentenceIndex - b.sourceSentenceIndex,
  );
  const byKey = new Map<string, SeraTrajectorySeed>();
  for (const item of compatible) {
    const key = `${actorKey(item.actor)}|${signature(item.statement)}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      item.selectedForPrimaryPoa ||
      (!existing.roles.includes("FIRST_DEPARTURE") &&
        item.roles.includes("FIRST_DEPARTURE"))
    )
      byKey.set(key, item);
  }
  const result = [...byKey.values()].sort(
    (a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex,
  );
  const collapsed: SeraTrajectorySeed[] = [];
  for (const item of result) {
    const itemActorKey = actorKey(item.actor);
    const duplicate = collapsed.find((existing) => {
      const existingActorKey = actorKey(existing.actor);
      const actorCompatible =
        !existingActorKey || !itemActorKey || existingActorKey === itemActorKey;
      return (
        actorCompatible &&
        signature(existing.statement) === signature(item.statement) &&
        (sameText(existing.statement, item.statement) ||
          Math.abs(existing.sourceSentenceIndex - item.sourceSentenceIndex) <=
            3)
      );
    });
    if (!duplicate) {
      collapsed.push(item);
      continue;
    }
    duplicate.roles = [...new Set([...duplicate.roles, ...item.roles])];
    duplicate.actor = duplicate.actor ?? item.actor;
    if (item.selectedForPrimaryPoa) {
      duplicate.statement = item.statement;
      duplicate.sourceSentenceIndex = item.sourceSentenceIndex;
      duplicate.selectedForPrimaryPoa = true;
      duplicate.relationToPrimary = "PRIMARY";
      duplicate.actor = item.actor ?? duplicate.actor;
      duplicate.confidence = item.confidence;
    }
  }
  if (
    primaryStatement &&
    !collapsed.some((item) => item.selectedForPrimaryPoa)
  ) {
    const primaryActor = args.directActor.actor;
    const candidate = collapsed.find(
      (item) =>
        actorKey(item.actor) === actorKey(primaryActor) &&
        (sameText(item.statement, primaryStatement) ||
          norm(item.statement).slice(0, 90) ===
            norm(primaryStatement).slice(0, 90) ||
          signature(item.statement) === signature(primaryStatement)),
    );
    if (candidate) {
      candidate.statement = primaryStatement;
      candidate.sourceSentenceIndex =
        primaryIndex ?? candidate.sourceSentenceIndex;
      candidate.actor = primaryActor ?? candidate.actor;
      candidate.selectedForPrimaryPoa = true;
      candidate.relationToPrimary = "PRIMARY";
      if (!candidate.roles.includes("CRITICAL_UNSAFE_ACT"))
        candidate.roles.push("CRITICAL_UNSAFE_ACT");
    } else {
      collapsed.push({
        statement: primaryStatement,
        sourceSentenceIndex: primaryIndex ?? 0,
        actor: primaryActor,
        roles: ["CRITICAL_UNSAFE_ACT"],
        confidence: args.escapePoint.confidence,
        phase: phaseOf(primaryContext),
        selectedForPrimaryPoa: true,
        relationToPrimary: "PRIMARY",
      });
    }
  }
  return collapsed
    .sort((a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex)
    .slice(0, 5);
}

export function buildCausalEvidenceGraph(args: {
  evidence: SeraEvidenceItem[];
  primaryAnchor: string | null;
}): SeraEvidenceGraph {
  const semantic = args.evidence.filter(
    (item) => item.collectionSource === "AI_SEMANTIC_EXTRACTION",
  );
  const nodes = semantic.map((item) => ({
    id: `NODE-${item.evidenceId}`,
    evidenceId: item.evidenceId,
    statement: item.statement,
    actor: item.actor,
    sourceSentenceIndex: item.sourceSentenceIndex,
    semanticRoles: item.semanticRoles ?? [],
    temporalRelation: item.temporalRelation,
  }));
  const edges: SeraEvidenceGraph["edges"] = [];
  const seen = new Set<string>();
  const add = (
    from: SeraEvidenceItem,
    to: SeraEvidenceItem,
    relation: SeraEvidenceGraph["edges"][number]["relation"],
    explicit: boolean,
    rationale: string,
  ) => {
    if (from.evidenceId === to.evidenceId) return;
    const key = `${from.evidenceId}|${to.evidenceId}|${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `EDGE-${edges.length + 1}`,
      fromEvidenceId: from.evidenceId,
      toEvidenceId: to.evidenceId,
      relation,
      supportLevel: explicit ? "EXPLICIT" : "RECONSTRUCTED_STRONG",
      rationale,
    });
  };
  const critical = semantic.filter(
    (item) =>
      item.semanticRoles?.includes("CRITICAL_UNSAFE_ACT") ||
      sameText(item.statement, args.primaryAnchor),
  );
  const sameActor = (a: SeraEvidenceItem, b: SeraEvidenceItem) =>
    !a.actor ||
    !b.actor ||
    norm(a.actor) === norm(b.actor) ||
    norm(a.actor).includes(norm(b.actor)) ||
    norm(b.actor).includes(norm(a.actor));
  const explicitCausal = (text: string) =>
    /\b(fez com que|devido a|por conta|porque|contribuiu|levou .* a|motivou .* a|a ponto de|because|caused|led .* to|contributed)\b/i.test(
      text,
    );
  const transfer = (text: string) =>
    /\b(outro equipamento|outra aeronave|412|sem automa[cç][aã]o|normalmente teria|atitude que .* tinha|habitual|usual)\b/i.test(
      text,
    );
  for (const to of critical) {
    for (const from of semantic) {
      if (
        Math.abs(from.sourceSentenceIndex - to.sourceSentenceIndex) > 45 ||
        !sameActor(from, to)
      )
        continue;
      if (from.semanticRoles?.includes("PRECONDITION")) {
        if (transfer(`${from.statement} ${to.statement}`))
          add(
            from,
            to,
            "TRANSFER_FROM_PRIOR_EXPERIENCE",
            true,
            "A experiência/familiaridade anterior é ligada à resposta selecionada no ato crítico.",
          );
        else if (explicitCausal(from.statement) || explicitCausal(to.statement))
          add(
            from,
            to,
            "CONTRIBUTES_TO",
            true,
            "O relato contém vínculo causal explícito entre o fator e o ato crítico.",
          );
        else if (from.semanticPreconditionCategory === "EQUIPMENT")
          add(
            from,
            to,
            "PARALLEL_CONDITION",
            false,
            "Condição técnica presente sem vínculo causal suficiente com a falha humana selecionada.",
          );
      }
      if (
        from.semanticRoles?.includes("OBJECTIVE_INTENT") &&
        from.temporalRelation !== "POST_ESCAPE"
      )
        add(
          from,
          to,
          "MOTIVATES",
          explicitCausal(from.statement) ||
            /\b(pra|para|objetivo|pretend|prefer)\w*/i.test(from.statement),
          "O objetivo/intenção é ligado ao meio de ação do mesmo ator e episódio.",
        );
      if (
        from.semanticRoles?.includes("PERCEPTION_STATE") &&
        from.temporalRelation !== "POST_ESCAPE"
      )
        add(
          from,
          to,
          "INFORMS_ACTION",
          false,
          "A percepção contemporânea é preservada como antecedente cognitivo do ato.",
        );
      if (
        from.temporalRelation === "POST_ESCAPE" &&
        from.semanticRoles?.some(
          (r) => r === "PERCEPTION_STATE" || r === "OUTCOME",
        )
      )
        add(
          to,
          from,
          "RETROSPECTIVE_VALIDATION",
          true,
          "A evidência posterior valida o estado real/desfecho, mas não prova disponibilidade da informação antes do ato.",
        );
    }
  }
  const ordered = [...semantic].sort(
    (a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex,
  );
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (b.sourceSentenceIndex - a.sourceSentenceIndex <= 2 && sameActor(a, b))
      add(
        a,
        b,
        "TEMPORALLY_PRECEDES",
        true,
        "Evidências adjacentes do mesmo ator preservam a ordem temporal local.",
      );
  }
  return { nodes, edges };
}
