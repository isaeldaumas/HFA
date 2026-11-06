import type { SupabaseClient } from '@supabase/supabase-js'

import type { ApiUserContext } from './api-auth'

/**
 * Historical name retained for existing callers. No self-provisioning is
 * authorized here: requireBearerUser has already resolved publicUserId,
 * tenantId and role from public.users and verified the Auth token.
 *
 * Revalidate that exact row before writes; NEVER resolve by arbitrary email,
 * create users, or fall back to a row in a different tenant.
 */
export async function ensurePublicUserRow(
  admin: SupabaseClient,
  user: ApiUserContext,
): Promise<string> {
  if (!user.authUserId || !user.publicUserId || !user.tenantId) {
    throw new Error('PUBLIC_USER_BINDING_MISSING')
  }
  const { data: row, error } = await admin
    .from('users')
    .select('id, tenant_id, auth_user_id, role, is_active, email')
    .eq('id', user.publicUserId)
    .eq('tenant_id', user.tenantId)
    .maybeSingle()

  if (error) throw new Error('PUBLIC_USER_BINDING_LOOKUP_FAILED')
  if (!row || row.is_active !== true || row.role !== user.role) {
    throw new Error('PUBLIC_USER_BINDING_INVALID')
  }
  if (row.auth_user_id && row.auth_user_id !== user.authUserId) {
    throw new Error('PUBLIC_USER_BINDING_CONFLICT')
  }
  if (user.identityBinding === 'DIRECT_AUTH_ID') {
    if (row.id !== user.authUserId) throw new Error('PUBLIC_USER_BINDING_CONFLICT')
  } else if (user.identityBinding === 'EXPLICIT_AUTH_LINK') {
    if (row.auth_user_id !== user.authUserId) throw new Error('PUBLIC_USER_BINDING_CONFLICT')
  } else if (user.identityBinding === 'LEGACY_CONFIRMED_EMAIL') {
    if (row.auth_user_id !== null ||
        !user.email ||
        row.email?.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new Error('PUBLIC_USER_BINDING_CONFLICT')
    }
  } else {
    throw new Error('PUBLIC_USER_BINDING_INVALID')
  }
  return String(row.id)
}

/**
 * No client-side balance read/modify/write. The V31 service-role-only RPC
 * verifies the tenant, actor, event and unique attempt ID and takes a
 * PostgreSQL row lock while writing tenant balance, event and ledger in ONE TX.
 *
 * Deploy dependency: the V31 migration MUST be present in staging before
 * shipping these callers. Missing RPC is deliberately fail-closed.
 */
export class HfaCreditOperationError extends Error {
  readonly status: 402 | 403 | 409 | 503
  constructor(readonly code: string) {
    super(code)
    this.name = 'HfaCreditOperationError'
    this.status =
      code === 'HFA_CREDIT_INSUFFICIENT_BALANCE' || code === 'HFA_CREDIT_TRIAL_EXPIRED' ? 402 :
      code === 'HFA_CREDIT_EVENT_ALREADY_CHARGED' || code === 'HFA_CREDIT_OPERATION_CONFLICT' ||
      code === 'HFA_CREDIT_REFUND_WITHOUT_DEBIT' || code === 'HFA_CREDIT_ALREADY_REFUNDED' ? 409 :
      code === 'HFA_CREDIT_USER_NOT_AUTHORIZED' || code === 'HFA_CREDIT_TENANT_NOT_ACTIVE' ||
      code === 'HFA_CREDIT_EVENT_NOT_AUTHORIZED' ? 403 : 503
  }
}

type HfaCreditState = 'applied' | 'already_applied' | 'refunded' | 'already_refunded'
export type HfaCreditResult = {
  state: HfaCreditState
  idempotent: boolean
  balance: number
  operationId: string
}
type CreditOperation = {
  admin: SupabaseClient
  tenantId: string
  submittedById: string
  eventId: string
  operationId: string
  title: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KNOWN_CREDIT_CODES = new Set([
  'HFA_CREDIT_INVALID_INPUT',
  'HFA_CREDIT_TENANT_NOT_ACTIVE',
  'HFA_CREDIT_USER_NOT_AUTHORIZED',
  'HFA_CREDIT_EVENT_NOT_AUTHORIZED',
  'HFA_CREDIT_EVENT_ALREADY_CHARGED',
  'HFA_CREDIT_TRIAL_EXPIRED',
  'HFA_CREDIT_INSUFFICIENT_BALANCE',
  'HFA_CREDIT_OPERATION_CONFLICT',
  'HFA_CREDIT_REFUND_WITHOUT_DEBIT',
])
async function applyHfaCreditOperation(
  params: CreditOperation,
  action: 'debit' | 'refund',
): Promise<HfaCreditResult> {
  const { admin, tenantId, submittedById, eventId, operationId, title } = params
  if (![tenantId, submittedById, eventId, operationId].every(value => UUID_PATTERN.test(value))) {
    throw new HfaCreditOperationError('HFA_CREDIT_INVALID_INPUT')
  }
  const { data, error } = await admin.rpc('hfa_apply_credit_operation_v31', {
    p_tenant_id: tenantId,
    p_user_id: submittedById,
    p_event_id: eventId,
    p_operation_id: operationId,
    p_action: action,
    p_title: title,
  })
  if (error) {
    const matched = /HFA_CREDIT_[A-Z_]+/.exec(String(error.message ?? ''))
    throw new HfaCreditOperationError(
      matched && KNOWN_CREDIT_CODES.has(matched[0])
        ? matched[0] : 'HFA_CREDIT_RPC_UNAVAILABLE'
    )
  }
  const payload = data as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.operation_id !== operationId ||
      !['applied', 'already_applied', 'refunded', 'already_refunded'].includes(String(payload.state)) ||
      typeof payload.idempotent !== 'boolean' ||
      typeof payload.balance !== 'number') {
    throw new HfaCreditOperationError('HFA_CREDIT_RPC_INVALID_RESPONSE')
  }
  const state = payload.state as HfaCreditState
  if (action === 'debit' && state === 'already_refunded') {
    throw new HfaCreditOperationError('HFA_CREDIT_ALREADY_REFUNDED')
  }
  if ((action === 'debit' && state === 'refunded') ||
      (action === 'refund' && !['refunded', 'already_refunded'].includes(state))) {
    throw new HfaCreditOperationError('HFA_CREDIT_RPC_INVALID_RESPONSE')
  }
  return {
    state,
    idempotent: payload.idempotent,
    balance: payload.balance,
    operationId,
  }
}

/** Charge at most once per attempt; a second legitimate attempt uses a NEW UUID. */
export async function debitCreditForEvent(params: CreditOperation): Promise<HfaCreditResult> {
  return applyHfaCreditOperation(params, 'debit')
}

/** Compensate only a recorded debit of the SAME attempt, exactly once. */
export async function refundCreditForFailedAnalysis(
  params: CreditOperation,
): Promise<HfaCreditResult> {
  return applyHfaCreditOperation(params, 'refund')
}
