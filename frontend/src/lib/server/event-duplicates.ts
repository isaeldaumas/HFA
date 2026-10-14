/** Conservative matching for same occurrence across Safety/HFA workflows.
 * Similar-but-independent events must never be merged automatically.
 */
export type DuplicateComparable = {
  id: string
  title: string
  raw_input: string
  occurred_at?: string | null
  aircraft_type?: string | null
  operation_type?: string | null
  created_at?: string | null
}

export function normalizeOccurrenceNarrative(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(\d{1,2})h(\d{2})\b/g, '$1:$2')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_match, h: string, min: string) => `${h.padStart(2, '0')}:${min}`)
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function compatibleDetails(a: DuplicateComparable, b: DuplicateComparable): boolean {
  for (const key of ['aircraft_type', 'operation_type'] as const) {
    if (a[key]?.trim() && b[key]?.trim()
      && normalizeOccurrenceNarrative(a[key]!) !== normalizeOccurrenceNarrative(b[key]!)) return false
  }
  // Occurrence time can be omitted, but explicit conflicting dates exclude a match.
  if (a.occurred_at && b.occurred_at
    && a.occurred_at.slice(0, 10) !== b.occurred_at.slice(0, 10)) return false
  return true
}

export function isLikelyDuplicate(a: DuplicateComparable, b: DuplicateComparable): boolean {
  if (a.id === b.id || !compatibleDetails(a, b)) return false
  const left = normalizeOccurrenceNarrative(a.raw_input)
  const right = normalizeOccurrenceNarrative(b.raw_input)
  // Do not match short generic summaries, titles, P/O/A codes or word overlap.
  return left.length >= 120 && left === right
}

export function matchingEarlierEvents(input: DuplicateComparable, existing: DuplicateComparable[], limit = 5): DuplicateComparable[] {
  return existing.filter((candidate) =>
    (!input.created_at || !candidate.created_at || candidate.created_at <= input.created_at)
      && isLikelyDuplicate(input, candidate),
  ).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)
}

export async function findTenantDuplicateCandidates(args: {
  admin: ReturnType<typeof import('./supabase-admin').getSupabaseAdmin>
  tenantId: string
  input: DuplicateComparable
  excludeConfirmedDuplicates?: boolean
}): Promise<DuplicateComparable[]> {
  const { data, error } = await args.admin.from('events')
    .select('id, title, raw_input, occurred_at, aircraft_type, operation_type, created_at')
    .eq('tenant_id', args.tenantId).is('deleted_at', null).neq('deletion_status', 'PURGED')
    .order('created_at', { ascending: false }).limit(2000)
  if (error) throw new Error('EVENT_DUPLICATE_LOOKUP_FAILED')
  const matches = matchingEarlierEvents(args.input, (data ?? []) as DuplicateComparable[], 5)
  if (!matches.length || !args.excludeConfirmedDuplicates) return matches
  const { data: existingLinks, error: linksError } = await args.admin.from('event_duplicate_links')
    .select('canonical_event_id, duplicate_event_id').eq('tenant_id', args.tenantId)
    .in('duplicate_event_id', matches.map((event) => event.id))
  if (linksError) throw new Error('EVENT_DUPLICATE_LINK_LOOKUP_FAILED')
  const duplicates = new Set((existingLinks ?? []).map((link) => link.duplicate_event_id))
  return matches.filter((match) => !duplicates.has(match.id))
}

export function publicDuplicateMatches(matches: DuplicateComparable[]) {
  return matches.map((event) => ({
    eventId: event.id,
    title: event.title,
    createdAt: event.created_at,
    reason: 'Relato factual equivalente após normalização da escrita do horário',
  }))
}
