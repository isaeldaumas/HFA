'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TRIAL_LIMIT, buildTrialUsage, type TrialUsage } from '@/lib/product/trial'

type TrialUsageCardProps = {
  used?: number
  limit?: number
  compact?: boolean
  showCreateCta?: boolean
}

const STATUS_STYLES: Record<TrialUsage['status'], { badge: string; bar: string; panel: string }> = {
  available: {
    badge: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    bar: 'bg-blue-500',
    panel: 'border-blue-500/20 bg-blue-500/10',
  },
  near_limit: {
    badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    bar: 'bg-amber-500',
    panel: 'border-amber-500/20 bg-amber-500/10',
  },
  limit_reached: {
    badge: 'text-red-300 bg-red-500/10 border-red-500/20',
    bar: 'bg-red-500',
    panel: 'border-red-500/20 bg-red-500/10',
  },
  expired: {
    badge: 'text-red-300 bg-red-500/10 border-red-500/20',
    bar: 'bg-red-500',
    panel: 'border-red-500/20 bg-red-500/10',
  },
}

export function TrialUsageCard({
  used,
  limit = DEFAULT_TRIAL_LIMIT,
  compact = false,
  showCreateCta = true,
}: TrialUsageCardProps) {
  const [remoteUsage, setRemoteUsage] = useState<TrialUsage | null>(null)
  const [loading, setLoading] = useState(used == null)

  useEffect(() => {
    if (used != null) return

    let active = true

    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          if (active) setLoading(false)
          return
        }

        const res = await fetch('/api/trial/status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json) {
          throw new Error(typeof json?.detail === 'string' ? json.detail : `HTTP ${res.status}`)
        }
        if (active) setRemoteUsage(json as TrialUsage)
      } catch (error) {
        console.error('Falha ao carregar status do trial', error)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [used])

  const usage = useMemo(() => {
    if (used != null) return buildTrialUsage(used, limit)
    return remoteUsage
  }, [limit, remoteUsage, used])
  const effectiveLoading = used == null && loading

  if (effectiveLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <p className="text-slate-400 text-sm">Carregando status do trial...</p>
      </div>
    )
  }

  if (!usage) {
    return null
  }

  const progress = Math.min((usage.used / usage.limit) * 100, 100)
  const styles = STATUS_STYLES[usage.status]

  return (
    <div className={`border rounded-xl ${compact ? 'p-4' : 'p-5'} ${styles.panel}`}>
      <div className={`flex ${compact ? 'flex-col gap-3' : 'flex-col sm:flex-row sm:items-start sm:justify-between gap-4'}`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-white text-sm font-semibold">Piloto gratuito · até {usage.limit} análises</p>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}>
              {usage.status === 'available'
                ? 'Trial ativo'
                : usage.status === 'near_limit'
                  ? 'Perto do limite'
                  : usage.status === 'expired'
                    ? 'Piloto encerrado'
                    : 'Limite concluído'}
            </span>
          </div>
          <p className="text-slate-300 text-sm">
            <span className="font-semibold text-white">{usage.used}</span> de{' '}
            <span className="font-semibold text-white">{usage.limit}</span> usadas.
            {' '}
            Restam <span className="font-semibold text-white">{usage.remaining}</span>.
          </p>
          <p className="text-slate-400 text-sm leading-relaxed">{usage.message}</p>
        </div>

        {showCreateCta && !['limit_reached', 'expired'].includes(usage.status) && (
          <div className="shrink-0">
            <Link
              href="/events/new"
              className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Criar analise
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="h-2 rounded-full bg-slate-900/70 overflow-hidden">
          <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>{usage.daysRemaining != null ? `${usage.daysRemaining} dias restantes` : 'Perfil inicial em formação'}</span>
          <span>{usage.used}/{usage.limit}</span>
        </div>
      </div>

      {['limit_reached', 'expired'].includes(usage.status) && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-sm text-slate-300">
            Continue com o HFA sem perder o histórico, as análises e a rastreabilidade do perfil organizacional.
          </p>
        </div>
      )}
    </div>
  )
}
