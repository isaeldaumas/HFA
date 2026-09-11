import type { SupabaseClient } from '@supabase/supabase-js'

export const EVENT_DELETION_RECOVERY_DAYS = 30
export const SYNTHETIC_EVENT_PREFIX = '[EVENT_DELETE_TEST]'
export const SYNTHETIC_PURGE_CONFIRMATION = 'PURGE_SYNTHETIC_FIXTURE_ONLY'

export const EVENT_DELETION_STATUSES = [
  'ACTIVE',
  'SOFT_DELETED',
  'PURGE_SCHEDULED',
  'PURGE_FAILED',
  'PURGED',
  'RESTORED',
] as const

export type EventDeletionStatus = (typeof EVENT_DELETION_STATUSES)[number]

export type DeletionStorageObject = {
  bucket: string
  path: string
  category: string
  exists: boolean
}

export type CompleteDeletionImpact = {
  event: number
  legacyAnalyses: number
  vnextAnalyses: number
  revisions: number
  reviews: number
  analysisEvents: number
  auditLogs: number
  evidenceItems: number
  attachments: number
  storageObjects: DeletionStorageObject[]
  exports: number
  correctiveActionsOpen: number
  correctiveActionsClosed: number
  riskProfileExclusions: number
  relatedEventIds: string[]
  unknownDependencies: string[]
  recoverableDays: number
  purgeEligible: boolean
  purgeBlockers: string[]
}

export type EventDeletionImpact = CompleteDeletionImpact

export type EventDeletionRecord = {
  id: string
  tenant_id: string
  title: string
  status: string
  submitted_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  deletion_reason: string | null
  deletion_status: EventDeletionStatus | null
  recoverable_until: string | null
  purge_scheduled_at: string | null
  purged_at: string | null
  analyses:
    | {
        id: string
        source_file_url: string | null
      }
    | Array<{
        id: string
        source_file_url: string | null
      }>
    | null
}

export function normalizeAnalysis(
  value: EventDeletionRecord['analyses'],
): { id: string; source_file_url: string | null } | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function resolvePublicUserId(args: {
  admin: SupabaseClient
  tenantId: string
  authUserId: string
  email?: string | null
}): Promise<string> {
  const { admin, tenantId, authUserId, email } = args
  if (!authUserId?.trim()) throw new Error('EVENT_DELETE_FORBIDDEN')

  const byId = await admin
    .from('users')
    .select('id, tenant_id, is_active')
    .eq('id', authUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (byId.error) throw new Error('EVENT_DELETE_IDENTITY_LOOKUP_FAILED')
  if (byId.data?.is_active !== false && byId.data?.id) return String(byId.data.id)

  const byAuth = await admin
    .from('users')
    .select('id, tenant_id, is_active')
    .eq('auth_user_id', authUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (byAuth.error) throw new Error('EVENT_DELETE_IDENTITY_LOOKUP_FAILED')
  if (byAuth.data?.is_active !== false && byAuth.data?.id) return String(byAuth.data.id)

  if (email?.trim()) {
    const byEmail = await admin
      .from('users')
      .select('id, tenant_id, is_active')
      .eq('email', email.trim())
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (byEmail.error) throw new Error('EVENT_DELETE_IDENTITY_LOOKUP_FAILED')
    if (byEmail.data?.is_active !== false && byEmail.data?.id) return String(byEmail.data.id)
  }

  throw new Error('EVENT_DELETE_FORBIDDEN')
}

export function parseStorageObjectPath(value: string | null | undefined): { bucket: string; path: string } | null {
  if (!value?.trim()) return null
  const raw = value.trim()

  try {
    const url = new URL(raw)
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
    if (match) {
      return {
        bucket: decodeURIComponent(match[1]),
        path: decodeURIComponent(match[2]),
      }
    }
  } catch {
    // Raw bucket/path references are handled below.
  }

  const clean = raw.replace(/^\/+/, '').split('?')[0]
  const slash = clean.indexOf('/')
  if (slash <= 0 || slash === clean.length - 1) return null
  return {
    bucket: clean.slice(0, slash),
    path: clean.slice(slash + 1),
  }
}

async function storageObjectExists(
  admin: SupabaseClient,
  object: { bucket: string; path: string },
): Promise<boolean> {
  const slash = object.path.lastIndexOf('/')
  const folder = slash >= 0 ? object.path.slice(0, slash) : ''
  const name = slash >= 0 ? object.path.slice(slash + 1) : object.path
  const { data, error } = await admin.storage.from(object.bucket).list(folder, {
    limit: 1000,
  })
  if (error) return false
  if ((data ?? []).some((item) => item.name === name)) return true

  // Fallback: attempt a metadata probe via download of 0 bytes range is unavailable;
  // createSignedUrl succeeds only when the object exists.
  const signed = await admin.storage.from(object.bucket).createSignedUrl(object.path, 10)
  return !signed.error && typeof signed.data?.signedUrl === 'string'
}

function countEvidenceValues(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((total, item) => total + countEvidenceValues(item), 0)

  return Object.entries(value as Record<string, unknown>).reduce((total, [key, item]) => {
    const direct = /evidence/i.test(key) && Array.isArray(item) ? item.length : 0
    return total + direct + countEvidenceValues(item)
  }, 0)
}

function countByStatuses(actions: Array<{ status: string }>) {
  const openStatuses = new Set(['pending', 'in_progress', 'overdue'])
  return {
    open: actions.filter((action) => openStatuses.has(action.status)).length,
    closed: actions.filter((action) => !openStatuses.has(action.status)).length,
  }
}

export async function getEventDeletionRecord(
  admin: SupabaseClient,
  tenantId: string,
  eventId: string,
): Promise<EventDeletionRecord | null> {
  const { data, error } = await admin
    .from('events')
    .select('id, tenant_id, title, status, submitted_by, deleted_at, deleted_by, deletion_reason, deletion_status, recoverable_until, purge_scheduled_at, purged_at, analyses(id, source_file_url)')
    .eq('tenant_id', tenantId)
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error('EVENT_DELETE_FETCH_FAILED')
  return (data as EventDeletionRecord | null) ?? null
}

export async function getEventDeletionImpact(
  admin: SupabaseClient,
  tenantId: string,
  eventId: string,
): Promise<CompleteDeletionImpact> {
  const event = await getEventDeletionRecord(admin, tenantId, eventId)
  if (!event) throw new Error('EVENT_NOT_FOUND')

  const legacyAnalysis = normalizeAnalysis(event.analyses)
  const legacyAnalysisId = legacyAnalysis?.id ?? null

  const [vnextBySource, vnextByMetadata, riskExclusions, actions, auditLogs, legacyEdits] = await Promise.all([
    admin
      .from('sera_vnext_analyses')
      .select('id, engine_input, engine_output, metadata')
      .eq('tenant_id', tenantId)
      .eq('source_reference', eventId),
    admin
      .from('sera_vnext_analyses')
      .select('id, engine_input, engine_output, metadata')
      .eq('tenant_id', tenantId)
      .contains('metadata', { eventId }),
    admin
      .from('risk_profile_exclusions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_type', 'legacy_event')
      .eq('source_id', eventId)
      .is('restored_at', null),
    legacyAnalysisId
      ? admin.from('corrective_actions').select('id, status').eq('tenant_id', tenantId).eq('analysis_id', legacyAnalysisId)
      : Promise.resolve({ data: [] as Array<{ id: string; status: string }>, error: null }),
    admin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .or(legacyAnalysisId ? `entity_id.eq.${eventId},entity_id.eq.${legacyAnalysisId}` : `entity_id.eq.${eventId}`),
    legacyAnalysisId
      ? admin.from('analysis_edits').select('id', { count: 'exact', head: true }).eq('analysis_id', legacyAnalysisId)
      : Promise.resolve({ count: 0, error: null }),
  ])

  const lookupErrors = [
    vnextBySource.error,
    vnextByMetadata.error,
    riskExclusions.error,
    actions.error,
    auditLogs.error,
    legacyEdits.error,
  ].filter(Boolean)
  if (lookupErrors.length > 0) throw new Error('EVENT_DELETE_IMPACT_LOOKUP_FAILED')

  const vnextMap = new Map<string, Record<string, unknown>>()
  for (const row of [...(vnextBySource.data ?? []), ...(vnextByMetadata.data ?? [])]) {
    vnextMap.set(String(row.id), row as Record<string, unknown>)
  }
  const vnextRows = [...vnextMap.values()]
  const vnextIds = [...vnextMap.keys()]

  const [revisions, reviews, analysisEvents] = vnextIds.length > 0
    ? await Promise.all([
        admin.from('sera_vnext_analysis_revisions').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('analysis_id', vnextIds),
        admin.from('sera_vnext_analysis_reviews').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('analysis_id', vnextIds),
        admin.from('sera_vnext_analysis_events').select('id, event_type').eq('tenant_id', tenantId).in('analysis_id', vnextIds),
      ])
    : [
        { count: 0, error: null },
        { count: 0, error: null },
        { data: [] as Array<{ id: string; event_type: string }>, error: null },
      ]

  if (revisions.error || reviews.error || analysisEvents.error) {
    throw new Error('EVENT_DELETE_IMPACT_LOOKUP_FAILED')
  }

  const unknownDependencies: string[] = []
  const storageObjects: DeletionStorageObject[] = []
  if (legacyAnalysis?.source_file_url) {
    const parsed = parseStorageObjectPath(legacyAnalysis.source_file_url)
    if (!parsed) {
      unknownDependencies.push('legacy_analysis_source_file_url_unparseable')
    } else {
      storageObjects.push({
        ...parsed,
        category: 'legacy_analysis_source',
        exists: await storageObjectExists(admin, parsed),
      })
    }
  }

  const actionCounts = countByStatuses((actions.data ?? []) as Array<{ status: string }>)
  const eventRows = (analysisEvents.data ?? []) as Array<{ id: string; event_type: string }>
  const purgeBlockers = [
    ...unknownDependencies.map((item) => `unknown:${item}`),
    ...(actionCounts.open > 0 ? [`open_corrective_actions:${actionCounts.open}`] : []),
    ...storageObjects.filter((item) => !item.exists).map((item) => `storage_missing:${item.bucket}/${item.path}`),
  ]
  const recoveryExpired = !!event.recoverable_until && new Date(event.recoverable_until).getTime() < Date.now()

  return {
    event: 1,
    legacyAnalyses: legacyAnalysisId ? 1 : 0,
    vnextAnalyses: vnextRows.length,
    revisions: (legacyEdits.count ?? 0) + (revisions.count ?? 0),
    reviews: reviews.count ?? 0,
    analysisEvents: eventRows.length,
    auditLogs: auditLogs.count ?? 0,
    evidenceItems: vnextRows.reduce((total, row) => total + countEvidenceValues(row), 0),
    attachments: legacyAnalysis?.source_file_url ? 1 : 0,
    storageObjects,
    exports: eventRows.filter((item) => item.event_type === 'analysis.exported').length,
    correctiveActionsOpen: actionCounts.open,
    correctiveActionsClosed: actionCounts.closed,
    riskProfileExclusions: (riskExclusions.data ?? []).length,
    relatedEventIds: [eventId],
    unknownDependencies,
    recoverableDays: EVENT_DELETION_RECOVERY_DAYS,
    purgeEligible: event.deletion_status === 'SOFT_DELETED' && recoveryExpired && purgeBlockers.length === 0,
    purgeBlockers,
  }
}

function mapRpcError(message: string): never {
  const knownCodes = [
    'EVENT_NOT_FOUND',
    'EVENT_DELETE_FORBIDDEN',
    'EVENT_DELETE_TITLE_MISMATCH',
    'EVENT_DELETE_REASON_REQUIRED',
    'EVENT_DELETE_ALREADY_DELETED',
    'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK',
    'EVENT_DELETE_IMPACT_INCOMPLETE',
    'EVENT_RESTORE_WINDOW_EXPIRED',
    'EVENT_RESTORE_NOT_ALLOWED',
    'EVENT_PURGE_NOT_ELIGIBLE',
    'EVENT_DELETE_CONFLICT',
  ]
  const known = knownCodes.find((code) => message.includes(code))
  throw new Error(known ?? 'EVENT_DELETE_INTERNAL_ERROR')
}

export async function softDeleteEvent(args: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  actorUserId: string
  reason: string
  confirmationTitle: string
  requestId: string
  unknownDependencies: string[]
}) {
  const { data, error } = await args.admin.rpc('request_event_soft_delete', {
    p_event_id: args.eventId,
    p_tenant_id: args.tenantId,
    p_actor_id: args.actorUserId,
    p_reason: args.reason.trim(),
    p_confirmation_title: args.confirmationTitle,
    p_request_id: args.requestId,
    p_unknown_dependencies: args.unknownDependencies,
  })
  if (error) mapRpcError(error.message ?? '')
  const result = data as { deleted_at: string; recoverable_until: string; idempotent: boolean }
  return {
    deletedAt: result.deleted_at,
    recoverableUntil: result.recoverable_until,
    idempotent: result.idempotent ?? false,
  }
}

export async function restoreSoftDeletedEvent(args: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  actorUserId: string
  requestId: string
}) {
  const { data, error } = await args.admin.rpc('restore_soft_deleted_event', {
    p_event_id: args.eventId,
    p_tenant_id: args.tenantId,
    p_actor_id: args.actorUserId,
    p_request_id: args.requestId,
  })
  if (error) mapRpcError(error.message ?? '')
  const result = data as { restored_at: string; idempotent: boolean }
  return { restoredAt: result.restored_at, idempotent: result.idempotent ?? false }
}

async function markPurgeFailed(args: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  actorUserId: string
  requestId: string
  failureCode: string
}) {
  await args.admin.rpc('mark_event_purge_failed', {
    p_event_id: args.eventId,
    p_tenant_id: args.tenantId,
    p_actor_id: args.actorUserId,
    p_request_id: args.requestId,
    p_failure_code: args.failureCode,
  })
}

export async function purgeSoftDeletedEvent(args: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  actorUserId: string
  requestId: string
  executeSynthetic?: boolean
  secondaryConfirmation?: string
}) {
  const event = await getEventDeletionRecord(args.admin, args.tenantId, args.eventId)
  if (!event) throw new Error('EVENT_NOT_FOUND')

  const impact = await getEventDeletionImpact(args.admin, args.tenantId, args.eventId)
  if (!args.executeSynthetic) {
    return {
      mode: 'PURGE_DRY_RUN' as const,
      impact,
      storageObjects: impact.storageObjects,
      requestId: args.requestId,
    }
  }

  const stagingRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://invalid').hostname.split('.')[0]
  const executionEnabled = process.env.EVENT_PURGE_SYNTHETIC_EXECUTE_ENABLED === 'true'
  if (
    !executionEnabled ||
    stagingRef.length < 8 ||
    !event.title.startsWith(SYNTHETIC_EVENT_PREFIX) ||
    args.secondaryConfirmation !== SYNTHETIC_PURGE_CONFIRMATION ||
    impact.unknownDependencies.length > 0 ||
    impact.purgeBlockers.length > 0
  ) {
    throw new Error('EVENT_PURGE_NOT_ELIGIBLE')
  }

  const scheduled = await args.admin.rpc('schedule_event_purge', {
    p_event_id: args.eventId,
    p_tenant_id: args.tenantId,
    p_actor_id: args.actorUserId,
    p_request_id: args.requestId,
    p_unknown_dependencies: impact.unknownDependencies,
    p_purge_blockers: impact.purgeBlockers,
  })
  if (scheduled.error) mapRpcError(scheduled.error.message ?? '')

  try {
    for (const object of impact.storageObjects) {
      const remove = await args.admin.storage.from(object.bucket).remove([object.path])
      if (remove.error) throw new Error('STORAGE_DELETE_FAILED')
      if (await storageObjectExists(args.admin, object)) throw new Error('STORAGE_DELETE_CONFIRMATION_FAILED')
    }
  } catch (error) {
    await markPurgeFailed({
      ...args,
      failureCode: error instanceof Error ? error.message : 'STORAGE_DELETE_FAILED',
    })
    throw new Error('EVENT_PURGE_NOT_ELIGIBLE')
  }

  const completed = await args.admin.rpc('complete_event_purge', {
    p_event_id: args.eventId,
    p_tenant_id: args.tenantId,
    p_actor_id: args.actorUserId,
    p_request_id: args.requestId,
    p_secondary_confirmation: args.secondaryConfirmation,
  })
  if (completed.error) mapRpcError(completed.error.message ?? '')

  return {
    mode: 'PURGE_EXECUTE_SYNTHETIC' as const,
    impact,
    storageObjects: impact.storageObjects,
    requestId: args.requestId,
    result: completed.data,
  }
}
