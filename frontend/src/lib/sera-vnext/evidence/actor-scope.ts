import type { SeraEvidenceActorRelation } from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectEvidenceActor(statement: string): string | null {
  const text = normalize(statement);
  // Prefer the grammatical/operational subject over a person merely mentioned as recipient.
  // Interview narratives use first-person deixis and labels such as "outro piloto" far more
  // often than formal PF/PM labels; keep those identities stable across evidence extraction.
  if (
    /\b(outro piloto|outro tripulante|o cara)\b.{0,180}\b(desacoplou|cancelou|reduziu|colocou|aplicou|puxou|empurrou|meteu|mexeu|pilotou|tentou|executou|subiu|desceu|fez)\b/.test(
      text,
    )
  )
    return "other pilot";
  if (
    /\beu\b.{0,180}\b(decidi|resolvi|optei|escolhi|julguei|preferi|tirei|retirei|desguarneci|peguei|puxei|empurrei|assumi|pousei|fiz|conduzi|executei|tentei|percebi|achei|acreditei)\b/.test(
      text,
    )
  )
    return "interviewed pilot";
  if (/^\s*(eu|i)\b/.test(text)) return "interviewed pilot";
  if (/\bpic\b/.test(text)) return "captain";
  if (/\bsic\b/.test(text)) return "first officer";
  if (
    /^(?:the )?(captain|comandante)\b/.test(text) ||
    /\b(captain|comandante)\b.{0,40}\b(said|mentioned|noted|commented|acknowledged|decided|selected|performed|executed|continued|informed|disse|mencionou|observou|comentou|reconheceu|confirmou|decidiu|selecionou|executou|prosseguiu|informou)\b/.test(
      text,
    )
  )
    return "captain";
  if (
    /^(?:the )?(first officer|copilot|copiloto)\b/.test(text) ||
    /\b(first officer|copilot|copiloto)\b.{0,40}\b(said|mentioned|noted|commented|acknowledged|decided|selected|performed|executed|continued|informed|disse|mencionou|observou|comentou|reconheceu|confirmou|decidiu|selecionou|executou|prosseguiu|informou)\b/.test(
      text,
    )
  )
    return "first officer";
  if (/\b(first officer|copilot|copiloto)\b/.test(text)) return "first officer";
  if (/\b(captain|comandante)\b/.test(text)) return "captain";
  if (/\bflight crew|\bcrew\b|tripulacao|\bnos\b|\bwe\b|\ba gente\b/.test(text))
    return "flight crew (collective)";
  if (/\bpilot\b|piloto/.test(text)) return "pilot";
  if (
    /\bmaintenance\b|manuten|mecanico|mecanicos|mechanic|mechanics|inspetor|inspetores|inspector|inspectors/.test(
      text,
    )
  )
    return "maintenance";
  if (/\bdispatch\b|operator pressure|organizational/.test(text))
    return "organization / dispatch context";
  if (
    /\bsystem\b|automation|autothrottle|fmc|dafcs|trim|rudder|control law|warning system/.test(
      text,
    )
  )
    return "technical system";
  if (
    /\bweather\b|windshear|microburst|visibility|fog|cloud|environment|meteorolog|vento/.test(
      text,
    )
  )
    return "environment";
  return null;
}

function directActorMatches(actor: string, directActor: string): boolean {
  const a = normalize(actor);
  const d = normalize(directActor);
  if (a === d) return true;
  const directActorIsCollective =
    /\b(e|and)\b/.test(d) &&
    /(piloto|pilot|comandante|captain|copiloto|first officer)/.test(d);
  const actorIsCollective =
    /\b(e|and)\b/.test(a) &&
    /(piloto|pilot|comandante|captain|copiloto|first officer)/.test(a);
  if (
    directActorIsCollective &&
    !actorIsCollective &&
    a !== "flight crew (collective)"
  )
    return false;
  // Semantic extraction may preserve a more specific label (e.g. "piloto entrevistado,
  // comandante da aeronave") than the deterministic actor resolver. Treat compatible
  // functional aliases as the same person instead of demoting their evidence to context.
  const semanticActorIsCollective =
    /\b(e|and)\b/.test(a) &&
    /(piloto|pilot|comandante|captain|copiloto|first officer)/.test(a);
  if (
    !semanticActorIsCollective &&
    (a.includes("piloto entrevistado") || a.includes("interviewed pilot")) &&
    (d.includes("piloto entrevistado") || d.includes("interviewed pilot"))
  )
    return true;
  if (
    !semanticActorIsCollective &&
    (a.includes("outro piloto") ||
      a.includes("other pilot") ||
      a.includes("piloto em adaptacao")) &&
    (d.includes("outro piloto") ||
      d.includes("other pilot") ||
      d.includes("piloto em adaptacao"))
  )
    return true;
  if (
    a === "flight crew (collective)" &&
    (d.includes("captain") ||
      d.includes("comandante") ||
      d.includes("copiloto") ||
      d.includes("first officer") ||
      d.includes("pilot") ||
      d.includes("piloto") ||
      d.includes("tripulacao") ||
      d.includes("flight crew") ||
      d.includes("multiple crew actors"))
  )
    return true;
  if (d.includes("copiloto") || d.includes("first officer"))
    return a === "first officer";
  if (d.includes("comandante") || d.includes("captain")) return a === "captain";
  if (
    d.includes("outro piloto") ||
    d.includes("other pilot") ||
    d.includes("piloto em adaptacao")
  )
    return a === "other pilot";
  if (d.includes("piloto entrevistado") || d.includes("interviewed pilot"))
    return a === "interviewed pilot";
  if (d === "piloto" || d === "pilot" || d.startsWith("piloto "))
    return a === "pilot";
  if (
    d.includes("tripulacao") ||
    d.includes("flight crew") ||
    d.includes("multiple crew actors")
  )
    return [
      "captain",
      "first officer",
      "pilot",
      "flight crew (collective)",
    ].includes(a);
  if (
    d.includes("maintenance") ||
    d.includes("manutencao") ||
    d.includes("mecanico") ||
    d.includes("inspetor")
  )
    return a === "maintenance";
  return false;
}

export function classifyActorRelationForActor(
  actor: string | null,
  directActor: string | null,
): SeraEvidenceActorRelation {
  if (!actor) return "UNKNOWN";
  if (actor === "technical system" || actor === "environment")
    return "SYSTEM_ENVIRONMENT";
  if (!directActor)
    return actor === "organization / dispatch context" ||
      actor === "maintenance"
      ? "CONTEXT_ACTOR"
      : "DIRECT_ACTOR";
  if (directActorMatches(actor, directActor)) return "DIRECT_ACTOR";
  return "CONTEXT_ACTOR";
}

export function classifyActorRelation(args: {
  statement: string;
  directActor: string | null;
}): SeraEvidenceActorRelation {
  return classifyActorRelationForActor(
    detectEvidenceActor(args.statement),
    args.directActor,
  );
}
