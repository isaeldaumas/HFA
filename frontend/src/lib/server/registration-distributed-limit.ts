import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type BudgetResult = 'allowed' | 'limited' | 'unavailable'

/**
 * Reject missing/weak HMAC secrets. The string never reaches the browser,
 * PostgreSQL, logs or audit events. The pre-existing Vercel WAF covers IP.
 */
export function registrationBudgetKey(
  email: string,
  scope: 'hour' | 'day',
  secret: string,
): string | null {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      Buffer.byteLength(secret, 'utf8') > 512) return null
  if (!email || email.length > 254 || !email.includes('@')) return null
  return createHmac('sha256', secret)
    .update(`hfa:registration:${scope}:v1:${email.trim().toLowerCase()}`, 'utf8')
    .digest('hex')
}

/**
 * No process-local cache: a single tenant-wide database counter shared by all
 * workers. If the RPC/DB is unavailable, no tenant or Auth invite is created.
 */
export async function consumeRegistrationBudget(
  admin: SupabaseClient,
  email: string,
  secret: string | undefined,
): Promise<BudgetResult> {
  const hourly = registrationBudgetKey(email, 'hour', secret ?? '')
  const daily = registrationBudgetKey(email, 'day', secret ?? '')
  if (!hourly || !daily) return 'unavailable'

  for (const spec of [
    { key: hourly, limit: 3, window: 3600 },
    { key: daily, limit: 8, window: 86400 },
  ]) {
    try {
      const { data, error } = await admin.rpc('hfa_registration_rate_limit_consume', {
        p_token_hash: spec.key,
        p_max_attempts: spec.limit,
        p_window_seconds: spec.window,
      })
      if (error || typeof data !== 'boolean') return 'unavailable'
      if (!data) return 'limited'
    } catch {
      return 'unavailable'
    }
  }
  return 'allowed'
}
