export type TrialStatus = 'available' | 'near_limit' | 'limit_reached' | 'expired'

export type TrialUsage = {
  limit: number
  used: number
  remaining: number
  status: TrialStatus
  message: string
  expiresAt: string | null
  daysRemaining: number | null
}

export type TrialUsageOptions = {
  expiresAt?: string | null
  now?: Date | string | number
}

export const DEFAULT_TRIAL_LIMIT = 15
export const DEFAULT_TRIAL_DAYS = 60

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function validDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function buildTrialUsage(
  used: number,
  limit = DEFAULT_TRIAL_LIMIT,
  options: TrialUsageOptions = {},
): TrialUsage {
  const normalizedLimit = normalizePositiveInteger(limit, DEFAULT_TRIAL_LIMIT)
  const normalizedUsed = Math.max(0, Number.isFinite(used) ? Math.floor(used) : 0)
  const remaining = Math.max(normalizedLimit - normalizedUsed, 0)
  const now = validDate(options.now ?? Date.now()) ?? new Date()
  const expiry = options.expiresAt ? validDate(options.expiresAt) : null
  const expiresAt = expiry?.toISOString() ?? null
  const daysRemaining = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000))
    : null

  let status: TrialStatus = 'available'
  let message = `Restam ${remaining} análises gratuitas no piloto.`

  if (expiry && expiry.getTime() <= now.getTime()) {
    status = 'expired'
    message = 'O piloto gratuito foi concluído. Fale conosco para continuar sem perder seu histórico.'
  } else if (normalizedUsed >= normalizedLimit) {
    status = 'limit_reached'
    message = `Você concluiu as ${normalizedLimit} análises incluídas no piloto. Fale conosco para continuar.`
  } else if (normalizedUsed >= normalizedLimit - 3) {
    status = 'near_limit'
    message = `Você está na reta final do piloto: restam ${remaining} análises.`
  }

  if (daysRemaining != null && status === 'available') {
    message += ` ${daysRemaining} dias restantes.`
  }

  return {
    limit: normalizedLimit,
    used: normalizedUsed,
    remaining,
    status,
    message,
    expiresAt,
    daysRemaining,
  }
}
