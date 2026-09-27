import type { SeraCanonicalPreconditionCategory } from './precondition-taxonomy'

export type SeraHfacsBridgeLevel = 'ACTIVE_FAILURE' | 'PRECONDITION' | 'SUPERVISION' | 'ORGANIZATION'
export type SeraHfacsBridgeEntry = { level: SeraHfacsBridgeLevel; hfacs: string; source: 'HENDY_2003_TABLE_3' | 'HENDY_2003_TABLE_4' | 'HENDY_2003_TABLE_5' | 'HENDY_2003_TABLE_6' }

const A = (hfacs: string): SeraHfacsBridgeEntry => ({ level: 'ACTIVE_FAILURE', hfacs, source: 'HENDY_2003_TABLE_3' })
const P = (hfacs: string): SeraHfacsBridgeEntry => ({ level: 'PRECONDITION', hfacs, source: 'HENDY_2003_TABLE_3' })
const S = (hfacs: string): SeraHfacsBridgeEntry => ({ level: 'SUPERVISION', hfacs, source: 'HENDY_2003_TABLE_3' })

/** Best-fit AGA 135 HFACS bridge described by Hendy. It is intentionally one-to-many where the source is one-to-many. */
export const SERA_ACTIVE_FAILURE_TO_HFACS: Record<string, SeraHfacsBridgeEntry[]> = {
  'P-A': [], 'O-A': [], 'A-A': [],
  'P-B': [P('Physical–mental limitations'), P('Personal readiness')],
  'P-C': [A('Knowledge–information')],
  'P-D': [A('Attention–memory')],
  'P-E': [P('Adverse mental state')],
  'P-F': [A('Perceptual')],
  'P-G': [A('Attention–memory')],
  'P-H': [A('Knowledge–information')],
  'O-B': [A('Violation – routine'), S('Supervisory violations')],
  'O-C': [A('Violation – exceptional'), S('Supervisory violations')],
  'O-D': [A('Decision')],
  'A-B': [A('Attention–memory')],
  'A-C': [A('Technique'), A('Attention–memory')],
  'A-D': [P('Physical–mental limitations')],
  'A-E': [A('Knowledge–information')],
  'A-F': [A('Decision')],
  'A-G': [A('Attention–memory')],
  'A-H': [P('Adverse mental state')],
  'A-I': [A('Decision'), P('Adverse mental state')],
  'A-J': [A('Attention–memory'), P('Adverse mental state')],
}

export const SERA_PRECONDITION_TO_HFACS: Partial<Record<SeraCanonicalPreconditionCategory, SeraHfacsBridgeEntry[]>> = {
  PHYSIOLOGICAL: [{ level: 'PRECONDITION', hfacs: 'Adverse physiological states', source: 'HENDY_2003_TABLE_4' }],
  PSYCHOLOGICAL: [{ level: 'PRECONDITION', hfacs: 'Adverse mental states', source: 'HENDY_2003_TABLE_4' }],
  SOCIAL: [{ level: 'PRECONDITION', hfacs: 'Interpersonal resource management', source: 'HENDY_2003_TABLE_4' }],
  PHYSICAL_CAPABILITY: [{ level: 'PRECONDITION', hfacs: 'Physical–mental limitation', source: 'HENDY_2003_TABLE_4' }],
  PERSONAL_READINESS: [{ level: 'PRECONDITION', hfacs: 'Personal readiness', source: 'HENDY_2003_TABLE_4' }],
  TRAINING_SELECTION: [A('Training'), { level: 'PRECONDITION', hfacs: 'Physical–mental limitation', source: 'HENDY_2003_TABLE_4' }],
  QUALIFICATION_AUTHORIZATION: [A('Qualification')],
  TIME_PRESSURE: [{ level: 'ORGANIZATION', hfacs: 'Organizational process', source: 'HENDY_2003_TABLE_4' }],
  OBJECTIVES: [{ level: 'SUPERVISION', hfacs: 'Planned inappropriate operations', source: 'HENDY_2003_TABLE_4' }],
  EQUIPMENT: [{ level: 'PRECONDITION', hfacs: 'Equipment', source: 'HENDY_2003_TABLE_4' }],
  WORKSPACE: [{ level: 'PRECONDITION', hfacs: 'Workspace', source: 'HENDY_2003_TABLE_4' }],
  ENVIRONMENT: [{ level: 'PRECONDITION', hfacs: 'Environment', source: 'HENDY_2003_TABLE_4' }],
  FORMING_INTENT: [{ level: 'SUPERVISION', hfacs: 'Planned inappropriate operations', source: 'HENDY_2003_TABLE_5' }, { level: 'SUPERVISION', hfacs: 'Supervisory violations', source: 'HENDY_2003_TABLE_5' }],
  COMMUNICATING_INTENT: [{ level: 'SUPERVISION', hfacs: 'Inadequate supervision', source: 'HENDY_2003_TABLE_5' }],
  MONITORING_SUPERVISION: [{ level: 'SUPERVISION', hfacs: 'Inadequate supervision', source: 'HENDY_2003_TABLE_5' }, { level: 'SUPERVISION', hfacs: 'Failed to correct a problem', source: 'HENDY_2003_TABLE_5' }],
  ORGANIZATIONAL_CLIMATE: [{ level: 'ORGANIZATION', hfacs: 'Organizational climate', source: 'HENDY_2003_TABLE_6' }],
  PROVISION_RESOURCES: [{ level: 'ORGANIZATION', hfacs: 'Resource management', source: 'HENDY_2003_TABLE_6' }],
  ORGANIZATIONAL_PROCESS_PRACTICES: [{ level: 'ORGANIZATION', hfacs: 'Organizational process', source: 'HENDY_2003_TABLE_6' }],
  MISSION: [{ level: 'SUPERVISION', hfacs: 'Planned inappropriate operations', source: 'HENDY_2003_TABLE_6' }, { level: 'ORGANIZATION', hfacs: 'Organizational process', source: 'HENDY_2003_TABLE_6' }, { level: 'ORGANIZATION', hfacs: 'Resource management', source: 'HENDY_2003_TABLE_6' }],
  RULES_REGULATIONS: [{ level: 'ORGANIZATION', hfacs: 'No direct AGA 135 HFACS equivalent identified by Hendy', source: 'HENDY_2003_TABLE_6' }],
  OVERSIGHT: [{ level: 'ORGANIZATION', hfacs: 'Organizational process', source: 'HENDY_2003_TABLE_6' }],
}

export function buildSeraHfacsBridge(codes: Array<string | null | undefined>, preconditions: Array<SeraCanonicalPreconditionCategory | null | undefined>) {
  const active = codes.flatMap((code) => code ? (SERA_ACTIVE_FAILURE_TO_HFACS[code] ?? []) : [])
  const pcs = preconditions.flatMap((category) => category ? (SERA_PRECONDITION_TO_HFACS[category] ?? []) : [])
  const dedupe = (entries: SeraHfacsBridgeEntry[]) => [...new Map(entries.map((entry) => [`${entry.level}|${entry.hfacs}`, entry])).values()]
  return {
    activeFailures: dedupe(active),
    preconditions: dedupe(pcs),
    note: 'Best-fit correspondence from Hendy (2003) Tables 3–6. Mapping is not one-to-one and must be interpreted in the context of the unsafe act; HFACS does not replace SERA traversal.',
  }
}
