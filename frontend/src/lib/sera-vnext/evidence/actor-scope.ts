import type { SeraEvidenceActorRelation } from './types'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function detectEvidenceActor(statement: string): string | null {
  const text = normalize(statement)
  if (/\b(first officer|copiloto)\b/.test(text)) return 'first officer'
  if (/\b(captain|comandante)\b/.test(text)) return 'captain'
  if (/\bflight crew|\bcrew\b|tripulacao/.test(text)) return 'flight crew (collective)'
  if (/\bpilot\b|piloto/.test(text)) return 'pilot'
  if (/\bmaintenance\b|manuten/.test(text)) return 'maintenance'
  if (/\bdispatch\b|operator pressure|organizational/.test(text)) return 'organization / dispatch context'
  if (/\bsystem\b|automation|autothrottle|fmc|dafcs|trim|rudder|control law|warning system/.test(text)) return 'technical system'
  if (/\bweather\b|windshear|microburst|visibility|fog|cloud|environment|meteorolog|vento/.test(text)) return 'environment'
  return null
}

function directActorMatches(actor: string, directActor: string): boolean {
  const a = normalize(actor)
  const d = normalize(directActor)
  if (a === d) return true
  if (d.includes('copiloto') || d.includes('first officer')) return a === 'first officer'
  if (d.includes('comandante') || d.includes('captain')) return a === 'captain'
  if (d.includes('tripulacao') || d.includes('flight crew') || d.includes('multiple crew actors')) return ['captain', 'first officer', 'pilot', 'flight crew (collective)'].includes(a)
  return false
}

export function classifyActorRelation(args: {
  statement: string
  directActor: string | null
}): SeraEvidenceActorRelation {
  const actor = detectEvidenceActor(args.statement)
  if (!actor) return 'UNKNOWN'
  if (actor === 'technical system' || actor === 'environment') return 'SYSTEM_ENVIRONMENT'
  if (actor === 'organization / dispatch context' || actor === 'maintenance') return 'CONTEXT_ACTOR'
  if (!args.directActor) return 'DIRECT_ACTOR'
  return directActorMatches(actor, args.directActor) ? 'DIRECT_ACTOR' : 'CONTEXT_ACTOR'
}
