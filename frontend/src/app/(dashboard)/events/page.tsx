'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { apiCall } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { computeHfaErcCategoryFromCodes, describeHfaErcCategory } from '@/lib/risk-profile/erc'

const statusLabel: Record<string, { label: string; color: string }> = {
  received: { label: 'Recebido', color: 'text-yellow-400' },
  processing: { label: 'Analisando…', color: 'text-blue-400' },
  completed: { label: 'Concluído', color: 'text-green-400' },
  failed: { label: 'Erro', color: 'text-red-400' },
}

type EventItem = {
  id: string
  title: string
  status: string
  operation_type?: string | null
  aircraft_type?: string | null
  created_at: string
  perception_code?: string | null
  objective_code?: string | null
  action_code?: string | null
  is_excluded_from_risk_profile?: boolean
  risk_profile_exclusion_id?: string | null
  risk_profile_exclusion_reason?: string | null
}

type DeletionImpact = {
  event: number
  legacyAnalyses: number
  vnextAnalyses: number
  revisions: number
  reviews: number
  analysisEvents: number
  auditLogs: number
  evidenceItems: number
  attachments: number
  storageObjects: Array<{ bucket: string; path: string; category: string; exists: boolean }>
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

function responseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return fallback
  return typeof (error as { message?: unknown }).message === 'string'
    ? String((error as { message: string }).message)
    : fallback
}

function ErcBadge({ p, o, a }: { p: string | null; o: string | null; a: string | null }) {
  const category = computeHfaErcCategoryFromCodes(p, o, a)
  if (!category) return null
  const meta = describeHfaErcCategory(category)
  const tone =
    category >= 5 ? 'text-red-400 bg-red-900/30' :
    category >= 4 ? 'text-orange-400 bg-orange-900/30' :
    category >= 3 ? 'text-yellow-400 bg-yellow-900/30' :
    category >= 2 ? 'text-slate-300 bg-slate-800' :
    'text-green-400 bg-green-900/30'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tone}`}>
      {meta.code} — {meta.label}
    </span>
  )
}

function DeleteEventModal(props: {
  event: EventItem | null
  impact: DeletionImpact | null
  busy: boolean
  error: string | null
  reason: string
  onClose: () => void
  onReasonChange: (value: string) => void
  onConfirm: () => void
}) {
  const {
    event,
    impact,
    busy,
    error,
    reason,
    onClose,
    onReasonChange,
    onConfirm,
  } = props

  if (!event) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-event-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key !== 'Tab') return
          const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, textarea, input, [href], [tabindex]:not([tabindex="-1"])'))
            .filter((control) => !control.hasAttribute('disabled'))
          if (controls.length === 0) return
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">Excluir evento e dados relacionados</p>
            <h2 id="delete-event-title" className="mt-2 text-xl font-semibold text-white">{event.title}</h2>
            <p className="mt-2 text-sm text-slate-400">
              Esta ação remove o evento da operação ativa, inicia um período de recuperação de 30 dias e não equivale a desconsiderar do Perfil de Risco.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">Fechar</button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Análises legadas</p>
            <p className="mt-2 text-2xl font-semibold text-white">{impact?.legacyAnalyses ?? '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Ações corretivas</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {impact ? `${impact.correctiveActionsOpen} abertas / ${impact.correctiveActionsClosed} encerradas` : '-'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Anexos</p>
            <p className="mt-2 text-2xl font-semibold text-white">{impact?.attachments ?? '-'}</p>
          </div>
        </div>

        {impact && (
          <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300 sm:grid-cols-2">
            <p>vNext: <strong>{impact.vnextAnalyses}</strong></p>
            <p>Revisões: <strong>{impact.revisions}</strong></p>
            <p>Reviews: <strong>{impact.reviews}</strong></p>
            <p>Audit logs: <strong>{impact.auditLogs}</strong></p>
            <p>Storage: <strong>{impact.storageObjects.length}</strong></p>
            <p>Perfil de Risco: <strong>{impact.riskProfileExclusions} exclusão(ões)</strong></p>
          </div>
        )}

        {impact && (impact.purgeBlockers.length > 0 || impact.unknownDependencies.length > 0) && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Bloqueios identificados</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {[...impact.purgeBlockers, ...impact.unknownDependencies].map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Motivo da exclusão</span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              autoFocus
              className="min-h-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
              placeholder="Explique por que o evento e os dados relacionados devem entrar em recuperação."
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Recuperável por {impact?.recoverableDays ?? 30} dias. Hard delete direto permanece desabilitado.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !reason.trim()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Excluindo...' : 'Excluir e iniciar período de recuperação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EventsPage() {
  const t = useT()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [canManageProfile, setCanManageProfile] = useState(false)
  const [busyEventId, setBusyEventId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<DeletionImpact | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setCanManageProfile(Boolean(me.is_admin) || String(me.role ?? '').toLowerCase() === 'admin')
        } else {
          setCanManageProfile(false)
        }
      } catch (error) {
        console.error('Falha ao carregar /api/auth/me para permissões de UI', error)
        setCanManageProfile(false)
      }
      const data = await apiCall('/events/', {}, session.access_token)
      setEvents(data)
      setLoading(false)
    }
    void load()
  }, [])

  async function refreshEvents() {
    if (!token) return
    const data = await apiCall('/events/', {}, token)
    setEvents(data)
  }

  async function excludeFromProfile(event: EventItem) {
    if (!token) return
    if (!window.confirm('Desconsiderar este evento do Perfil de Risco? O evento continuará disponível na lista.')) return
    const reason = window.prompt('Motivo opcional para desconsiderar este evento do perfil:', event.risk_profile_exclusion_reason ?? '') ?? ''
    setBusyEventId(event.id)
    setActionError(null)
    try {
      const res = await fetch('/api/risk-profile/exclusions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceType: 'legacy_event',
          sourceId: event.id,
          reason: reason.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(responseErrorMessage(body, `HTTP ${res.status}`))
      }
      await refreshEvents()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyEventId(null)
    }
  }

  async function restoreToProfile(event: EventItem) {
    if (!token || !event.risk_profile_exclusion_id) return
    if (!window.confirm('Restaurar este evento no Perfil de Risco?')) return
    setBusyEventId(event.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/risk-profile/exclusions/${event.risk_profile_exclusion_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(responseErrorMessage(body, `HTTP ${res.status}`))
      }
      await refreshEvents()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyEventId(null)
    }
  }

  async function openDeleteModal(event: EventItem) {
    if (!token) return
    setDeleteTarget(event)
    setDeleteImpact(null)
    setDeleteReason('')
    setActionError(null)
    setBusyEventId(event.id)
    try {
      const res = await fetch(`/api/events/${event.id}/deletion-impact`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(responseErrorMessage(body, `HTTP ${res.status}`))
      }
      setDeleteImpact(body)
    } catch (error) {
      setDeleteTarget(null)
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyEventId(null)
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return
    setBusyEventId(deleteTarget.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/events/${deleteTarget.id}/delete-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: deleteReason,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(responseErrorMessage(body, `HTTP ${res.status}`))
      }
      setDeleteTarget(null)
      setDeleteImpact(null)
      setDeleteReason('')
      await refreshEvents()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyEventId(null)
    }
  }

  return (
    <div className="p-8">
      <DeleteEventModal
        event={deleteTarget}
        impact={deleteImpact}
        busy={!!deleteTarget && busyEventId === deleteTarget.id}
        error={actionError}
        reason={deleteReason}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteImpact(null)
          setDeleteReason('')
        }}
        onReasonChange={setDeleteReason}
        onConfirm={() => void confirmDelete()}
      />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('events.title')}</h1>
          <p className="text-slate-400">Histórico de análises da sua operação</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/events/deleted" className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500">
            Eventos excluídos
          </Link>
          <Link href="/events/new" className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-500">
            + {t('events.newAnalysis')}
          </Link>
        </div>
      </div>

      {actionError && !deleteTarget && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">{t('common.loading')}</p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
          <p className="mb-4 text-slate-400">{t('events.noEvents')}</p>
          <Link href="/events/new" className="text-blue-400 hover:underline">
            {t('events.startAnalysis')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const s = statusLabel[event.status] || statusLabel.received
            return (
              <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/events/${event.id}`} className="block min-w-0 flex-1">
                    <h3 className="mb-1 truncate font-semibold text-white">{event.title}</h3>
                    <p className="text-sm text-slate-400">
                      {event.operation_type && `${event.operation_type} • `}
                      {event.aircraft_type && `${event.aircraft_type} • `}
                      {new Date(event.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </Link>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {event.is_excluded_from_risk_profile && (
                      <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
                        Desconsiderado no perfil
                      </span>
                    )}
                    <ErcBadge
                      p={event.perception_code ?? null}
                      o={event.objective_code ?? null}
                      a={event.action_code ?? null}
                    />
                    <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-[1.25rem]">
                    {event.risk_profile_exclusion_reason && (
                      <p className="text-xs text-slate-500">Motivo no perfil: {event.risk_profile_exclusion_reason}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageProfile && (
                      event.is_excluded_from_risk_profile ? (
                        <button
                          type="button"
                          onClick={() => void restoreToProfile(event)}
                          disabled={busyEventId === event.id}
                          className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                        >
                          {busyEventId === event.id ? 'Atualizando...' : 'Restaurar no perfil'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void excludeFromProfile(event)}
                          disabled={busyEventId === event.id}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          {busyEventId === event.id ? 'Atualizando...' : 'Desconsiderar do Perfil de Risco'}
                        </button>
                      )
                    )}
                    {canManageProfile && (
                      <button
                        type="button"
                        onClick={() => void openDeleteModal(event)}
                        disabled={busyEventId === event.id}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {busyEventId === event.id ? 'Calculando impacto...' : 'Excluir evento e dados relacionados'}
                      </button>
                    )}
                    <Link href={`/events/${event.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500">
                      Abrir evento
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
