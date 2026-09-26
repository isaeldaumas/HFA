import type { SeraEvidenceActorRelation } from './types'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function detectEvidenceActor(statement: string): string | null {
  const text = normalize(statement)
  // Prefer the grammatical/operational subject over a person merely mentioned as recipient.
  if (/^(?:the )?(captain|comandante)\b/.test(text) || /\b(captain|comandante)\b.{0,40}\b(said|decided|selected|performed|executed|continued|informed|disse|decidiu|selecionou|executou|prosseguiu|informou)\b/.test(text)) return 'captain'
  if (/^(?:the )?(first officer|copiloto)\b/.test(text) || /\b(first officer|copiloto)\b.{0,40}\b(said|decided|selected|performed|executed|continued|informed|disse|decidiu|selecionou|executou|prosseguiu|informou)\b/.test(text)) return 'first officer'
  if (/\b(first officer|copiloto)\b/.test(text)) return 'first officer'
  if (/\b(captain|comandante)\b/.test(text)) return 'captain'
  if (/\bflight crew|\bcrew\b|tripulacao/.test(text)) return 'flight crew (collective)'
  if (/\bpilot\b|piloto/.test(text)) return 'pilot'
  if (/\bmaintenance\b|manuten|mecanico|mecanicos|mechanic|mechanics|inspetor|inspetores|inspector|inspectors/.test(text)) return 'maintenance'
  if (/\bdispatch\b|operator pressure|organizational/.test(text)) return 'organization / dispatch context'
  if (/\bsystem\b|automation|autothrottle|fmc|dafcs|trim|rudder|control law|warning system/.test(text)) return 'technical system'
  if (/\bweather\b|windshear|microburst|visibility|fog|cloud|environment|meteorolog|vento/.test(text)) return 'environment'
  return null
}

function directActorMatches(actor: string, directActor: string): boolean {
  const a = normalize(actor)
  const d = normalize(directActor)
  if (a === d) return true
  if (a === 'flight crew (collective)' && (d.includes('captain') || d.includes('comandante') || d.includes('copiloto') || d.includes('first officer') || d.includes('pilot') || d.includes('piloto'))) return true
  if (d.includes('copiloto') || d.includes('first officer')) return a === 'first officer'
  if (d.includes('comandante') || d.includes('captain')) return a === 'captain'
  if (d.includes('tripulacao') || d.includes('flight crew') || d.includes('multiple crew actors')) return ['captain', 'first officer', 'pilot', 'flight crew (collective)'].includes(a)
  if (d.includes('maintenance') || d.includes('manutencao') || d.includes('mecanico') || d.includes('inspetor')) return a === 'maintenance'
  return false
}

export function classifyActorRelationForActor(actor: string | null, directActor: string | null): SeraEvidenceActorRelation {
  if (!actor) return 'UNKNOWN'
  if (actor === 'technical system' || actor === 'environment') return 'SYSTEM_ENVIRONMENT'
  if (!directActor) return actor === 'organization / dispatch context' || actor === 'maintenance' ? 'CONTEXT_ACTOR' : 'DIRECT_ACTOR'
  if (directActorMatches(actor, directActor)) return 'DIRECT_ACTOR'
  return 'CONTEXT_ACTOR'
}

export function classifyActorRelation(args: {
  statement: string
  directActor: string | null
}): SeraEvidenceActorRelation {
  return classifyActorRelationForActor(detectEvidenceActor(args.statement), args.directActor)
}
