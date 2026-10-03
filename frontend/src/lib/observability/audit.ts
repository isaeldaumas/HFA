import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

/**
 * Eventos auditáveis do sistema HFA.
 * Adicionar novos tipos aqui conforme novas fases forem implementadas.
 */
export type AuditEventType =
  | 'event_created'
  | 'safety_event_reported'
  | 'safety_event_triaged'
  | 'event.deletion_impact_viewed'
  | 'event.deletion_requested'
  | 'event.soft_deleted'
  | 'event.restored'
  | 'event.purge_scheduled'
  | 'event.purge_started'
  | 'event.storage_delete_failed'
  | 'event.purge_failed'
  | 'event.purged'
  | 'event.hard_delete_denied'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_partial'
  | 'analysis_failed'
  | 'corrective_action_created'
  | 'report_generated'
  | 'risk_profile.generated'
  | 'risk_profile.exclusion_created'
  | 'risk_profile.exclusion_restored'
  | 'risk_profile.export_requested'
  | 'tenant.bootstrap_failed'
  | 'classification_overridden'
  | 'canonical_engine.used'

/**
 * Critical audit events — must be durably recorded or the operation fails.
 * These are events that constitute the system of record for SERA analyses.
 */
const CRITICAL_AUDIT_EVENTS: ReadonlySet<AuditEventType> = new Set<AuditEventType>([
  'canonical_engine.used',
  'analysis_completed',
  'analysis_partial',
  'analysis_failed',
  'event_created',
  'safety_event_triaged',
  'event.deletion_requested',
  'event.soft_deleted',
  'event.restored',
  'event.purge_scheduled',
  'event.purge_started',
  'event.storage_delete_failed',
  'event.purge_failed',
  'event.purged',
  'event.hard_delete_denied',
  'risk_profile.generated',
])

/**
 * Operational telemetry — best-effort; silent failure is acceptable.
 */
function isCriticalAuditEvent(eventType: AuditEventType): boolean {
  return CRITICAL_AUDIT_EVENTS.has(eventType)
}

export type AuditStatus = 'success' | 'partial' | 'failed' | 'blocked'

export interface WriteAuditLogParams {
  tenantId: string | null
  userId: string | null
  requestId: string | null
  eventType: AuditEventType
  entityType?: string | null
  entityId?: string | null
  route?: string | null
  method?: string | null
  status?: AuditStatus
  metadata?: Record<string, unknown>
}

function buildAuditPayload(params: WriteAuditLogParams) {
  const {
    tenantId,
    userId,
    requestId,
    eventType,
    entityType = null,
    entityId = null,
    route = null,
    method = null,
    status = 'success',
    metadata = {},
  } = params

  const cleanMetadata: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata)) {
    if (v !== undefined && v !== null) {
      cleanMetadata[k] = v
    }
  }

  return {
    tenant_id: tenantId ?? null,
    user_id: userId ?? null,
    request_id: requestId ?? null,
    event_type: eventType,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    route: route ?? null,
    method: method ?? null,
    status,
    metadata: cleanMetadata,
  }
}

async function insertAuditLog(payload: ReturnType<typeof buildAuditPayload>): Promise<{ error: Error | null }> {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from('audit_log').insert(payload)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/**
 * Grava um evento no audit_log.
 *
 * - CRITICAL_AUDIT events: failure is THROWN (not silent). The caller must handle.
 * - OPERATIONAL_TELEMETRY events: best-effort; failure is logged but never propagated.
 * - Usa service role (getSupabaseAdmin) — não é afetado por RLS.
 * - metadata é limpo: remove undefined e null; nunca incluir relato/transcrição/tokens.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const payload = buildAuditPayload(params)
  const critical = isCriticalAuditEvent(params.eventType)

  try {
    const { error } = await insertAuditLog(payload)
    if (error) {
      if (critical) {
        throw new Error(`[audit] CRITICAL audit event failed: ${params.eventType} — ${error.message}`)
      }
      console.error('[audit] insert failed (telemetry)', {
        requestId: params.requestId,
        eventType: params.eventType,
        error: error.message,
      })
    }
  } catch (e) {
    if (critical) {
      // Re-throw critical audit failures — they are system-of-record events
      throw e
    }
    console.error('[audit] unexpected error (telemetry)', {
      requestId: params.requestId,
      eventType: params.eventType,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Write a critical audit event durably. Throws on failure.
 * Use for events that constitute the system of record.
 */
export async function writeCriticalAuditLog(params: WriteAuditLogParams): Promise<void> {
  const payload = buildAuditPayload(params)
  const { error } = await insertAuditLog(payload)
  if (error) {
    throw new Error(`[audit] Critical audit write failed for ${params.eventType}: ${error.message}`)
  }
}
