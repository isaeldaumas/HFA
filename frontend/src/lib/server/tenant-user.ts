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

export async function debitCreditForEvent(params: {
  admin: SupabaseClient
  tenantId: string
  submittedById: string
  eventId: string
  title: string
  isEnterprise: boolean
  currentBalance: number
}) {
  const { admin, tenantId, submittedById, eventId, title, isEnterprise, currentBalance } = params
  if (!isEnterprise) {
    await admin
      .from('tenants')
      .update({ credits_balance: currentBalance - 1 })
      .eq('id', tenantId)
  }
  await admin.from('credit_transactions').insert({
    tenant_id: tenantId,
    user_id: submittedById,
    type: 'consumption',
    amount: -1,
    event_id: eventId,
    description: `Análise SERA: ${title}`,
  })
}

/** Devolve 1 crédito ao tenant quando a análise falha após o débito (espelha lógica de enterprise). */
export async function refundCreditForFailedAnalysis(params: {
  admin: SupabaseClient
  tenantId: string
  submittedById: string
  eventId: string
  title: string
  isEnterprise: boolean
  /** Saldo atual já após o débito (para não-enterprise). */
  currentBalanceAfterDebit: number
}) {
  const { admin, tenantId, submittedById, eventId, title, isEnterprise, currentBalanceAfterDebit } =
    params
  if (!isEnterprise) {
    await admin
      .from('tenants')
      .update({ credits_balance: currentBalanceAfterDebit + 1 })
      .eq('id', tenantId)
  }
  await admin.from('credit_transactions').insert({
    tenant_id: tenantId,
    user_id: submittedById,
    type: 'refund',
    amount: 1,
    event_id: eventId,
    description: `Estorno: análise não concluída — ${title}`,
  })
}
