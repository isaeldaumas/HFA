'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { SeraActionSuggestion } from '@/lib/corrective-actions/sera-suggestions'
import { SERA_PRECONDITION_META, type SeraCanonicalPreconditionCategory } from '@/lib/sera-vnext/precondition-taxonomy'

// ── Static style maps (Tailwind-safe — no dynamic interpolation) ──────────────

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pendente',
  in_progress: 'Em andamento',
  completed:   'Concluído',
  cancelled:   'Cancelado',
}

const STATUS_NEXT: Record<string, { status: string; label: string }> = {
  pending:     { status: 'in_progress', label: 'Iniciar' },
  in_progress: { status: 'completed',   label: 'Concluir' },
}

const STATUS_BADGE: Record<string, string> = {
  pending:     'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20',
  in_progress: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  completed:   'text-green-400 bg-green-400/10 border border-green-400/20',
  cancelled:   'text-slate-400 bg-slate-800 border border-slate-700',
}

const EFFECTIVENESS_LABEL: Record<string, string> = {
  NOT_ASSESSED: 'Eficácia não avaliada',
  PENDING_VERIFICATION: 'Aguardando verificação de eficácia',
  EFFECTIVE: 'Eficaz',
  PARTIALLY_EFFECTIVE: 'Parcialmente eficaz',
  INEFFECTIVE: 'Ineficaz',
}

const EFFECTIVENESS_BADGE: Record<string, string> = {
  NOT_ASSESSED: 'text-slate-400 bg-slate-800 border border-slate-700',
  PENDING_VERIFICATION: 'text-violet-300 bg-violet-400/10 border border-violet-400/20',
  EFFECTIVE: 'text-emerald-300 bg-emerald-400/10 border border-emerald-400/20',
  PARTIALLY_EFFECTIVE: 'text-amber-300 bg-amber-400/10 border border-amber-400/20',
  INEFFECTIVE: 'text-red-300 bg-red-400/10 border border-red-400/20',
}

const FILTER_CARDS = [
  { key: 'pending',     label: 'Pendentes',    borderActive: 'border-yellow-500', textCount: 'text-yellow-400' },
  { key: 'in_progress', label: 'Em andamento', borderActive: 'border-blue-500',   textCount: 'text-blue-400'   },
  { key: 'completed',   label: 'Concluídas',   borderActive: 'border-green-500',  textCount: 'text-green-400'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate || status === 'completed' || status === 'cancelled') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDate + 'T00:00:00') < today
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function preconditionLabel(category: string | null | undefined): string | null {
  if (!category) return null
  const meta = SERA_PRECONDITION_META[category as SeraCanonicalPreconditionCategory]
  return meta?.pt ?? category
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionItem = {
  id: string
  title: string
  description?: string | null
  related_failure?: string | null
  status: string
  responsible?: string | null
  due_date?: string | null
  completed_at?: string | null
  effectiveness_status?: string | null
  effectiveness_notes?: string | null
  effectiveness_review_due_date?: string | null
  effectiveness_reviewed_at?: string | null
  created_at: string
  analysis_id?: string | null
  event_id?: string | null
  event_title?: string | null
  precondition_id?: string | null
  precondition_category?: string | null
  action_kind?: 'CORRECTIVE_PREVENTIVE' | 'INVESTIGATION' | 'GENERAL_SAFETY' | null
  linkage_status?: 'CURRENT' | 'STALE_PRECONDITION_LINK' | 'INVESTIGATION_TASK' | 'EVENT_ONLY' | null
  priority?: 'low' | 'medium' | 'high' | 'critical'
  category?: 'TREINAMENTO' | 'PROCEDIMENTO' | 'EQUIPAMENTO' | 'SUPERVISAO' | 'COMUNICACAO' | 'OUTRO' | null
  owner_user_id?: string | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [actions, setActions]   = useState<ActionItem[]>([])
  const [suggestions, setSuggestions] = useState<SeraActionSuggestion[]>([])
  const [creatingSuggestionId, setCreatingSuggestionId] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    responsible: '',
    due_date: '',
    effectiveness_status: 'NOT_ASSESSED',
    effectiveness_notes: '',
    effectiveness_review_due_date: '',
    priority: 'medium',
    category: '',
  })
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const headers = { Authorization: `Bearer ${session.access_token}` }
      const [actionsRes, suggestionsRes] = await Promise.all([
        fetch('/api/actions', { headers }),
        fetch('/api/actions/suggestions', { headers }),
      ])
      if (!actionsRes.ok) throw new Error(`Ações: HTTP ${actionsRes.status}`)
      if (!suggestionsRes.ok) throw new Error(`Sugestões: HTTP ${suggestionsRes.status}`)
      const [data, suggestionData] = await Promise.all([actionsRes.json(), suggestionsRes.json()])
      setActions(Array.isArray(data) ? data : [])
      setSuggestions(Array.isArray(suggestionData) ? suggestionData : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function patchAction(id: string, body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/actions/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }

  async function createSuggestion(suggestion: SeraActionSuggestion) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setCreatingSuggestionId(suggestion.id)
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_id: suggestion.analysisId,
          title: suggestion.title,
          description: suggestion.description,
          precondition_id: suggestion.preconditionId,
          precondition_category: suggestion.canonicalCategory,
          action_kind: suggestion.kind,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? `Falha ao criar ação: ${e.message}` : 'Falha ao criar ação sugerida.')
    } finally {
      setCreatingSuggestionId(null)
    }
  }

  async function advanceStatus(id: string, nextStatus: string) {
    try {
      await patchAction(id, { status: nextStatus })
      void load()
    } catch (e) {
      console.error('Erro ao atualizar status:', e)
    }
  }

  function startEdit(action: ActionItem) {
    setEditingId(action.id)
    setEditForm({
      responsible: action.responsible ?? '',
      due_date: action.due_date ?? '',
      effectiveness_status: action.effectiveness_status ?? 'NOT_ASSESSED',
      effectiveness_notes: action.effectiveness_notes ?? '',
      effectiveness_review_due_date: action.effectiveness_review_due_date ?? '',
      priority: action.priority ?? 'medium',
      category: action.category ?? '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try {
      await patchAction(id, {
        responsible: editForm.responsible.trim() || null,
        due_date: editForm.due_date || null,
        priority: editForm.priority,
        category: editForm.category || null,
        ...(actions.find((action) => action.id === id)?.status === 'completed' ? {
          effectiveness_status: editForm.effectiveness_status,
          effectiveness_notes: editForm.effectiveness_notes.trim() || null,
          effectiveness_review_due_date: editForm.effectiveness_review_due_date || null,
        } : {}),
      })
      setEditingId(null)
      void load()
    } catch (e) {
      console.error('Erro ao salvar:', e)
    } finally {
      setSaving(false)
    }
  }

  const eventOptions = useMemo(() => {
    const labels = new Map<string, string>()
    for (const action of actions) {
      if (action.event_id) labels.set(action.event_id, action.event_title ?? `Evento ${action.event_id.slice(0, 8)}`)
    }
    for (const suggestion of suggestions) {
      if (suggestion.eventId) labels.set(suggestion.eventId, suggestion.eventTitle ?? suggestion.analysisTitle)
    }
    return [...labels.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
  }, [actions, suggestions])

  const effectiveEventFilter = eventFilter === 'all' || eventOptions.some((event) => event.id === eventFilter)
    ? eventFilter
    : 'all'
  const eventScopedActions = effectiveEventFilter === 'all'
    ? actions
    : actions.filter((action) => action.event_id === effectiveEventFilter)
  const visibleSuggestions = effectiveEventFilter === 'all'
    ? suggestions
    : suggestions.filter((suggestion) => suggestion.eventId === effectiveEventFilter)
  const filtered = filter === 'all'
    ? eventScopedActions
    : eventScopedActions.filter((action) => action.status === filter)
  const counts: Record<string, number> = {
    pending:     eventScopedActions.filter((a) => a.status === 'pending').length,
    in_progress: eventScopedActions.filter((a) => a.status === 'in_progress').length,
    completed:   eventScopedActions.filter((a) => a.status === 'completed').length,
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Ações de Safety</h1>
        <p className="text-slate-400">Ações gerais de Safety e tratamentos derivados das análises SERA</p>
      </div>

      <div className="mb-6 rounded-xl border border-blue-800/60 bg-blue-950/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">Ciclo de tratamento de Safety</p>
            <p className="mt-1 text-sm text-slate-300">Evento → triagem → risco/investigação → ação → verificação de eficácia.</p>
          </div>
          <a href="/risk-profile" className="text-xs font-medium text-blue-300 hover:text-blue-200 border border-blue-800 px-3 py-1.5 rounded-lg">Ver Perfil de Risco →</a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Pré-condições sustentadas geram propostas de controle para validação humana. Hipóteses da Tabela 1 geram tarefas de investigação; elas não são tratadas como causa confirmada nem como recomendação definitiva.
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label htmlFor="event-filter" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Evento
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="event-filter"
            value={effectiveEventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="all">Todos os eventos ativos</option>
            {eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
          <span className="text-xs text-slate-500">
            Ações gerais ficam vinculadas ao evento; ações SERA preservam também a pré-condição de origem.
          </span>
        </div>
      </div>

      {/* Status filter cards — counts respect the selected event. */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {FILTER_CARDS.map((card) => (
          <button
            key={card.key}
            onClick={() => setFilter(filter === card.key ? 'all' : card.key)}
            className={`bg-slate-900 border rounded-xl p-5 text-left transition ${
              filter === card.key ? card.borderActive : 'border-slate-800 hover:border-slate-600'
            }`}
          >
            <p className="text-slate-400 text-sm">{card.label}</p>
            <p className={`text-3xl font-bold ${card.textCount}`}>{counts[card.key] ?? 0}</p>
          </button>
        ))}
      </div>

      {visibleSuggestions.length > 0 && (
        <section className="mb-8 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Sugestões SERA pendentes</h2>
              <p className="text-xs text-slate-500">Converta em ação rastreável somente após conferir a base factual e o escopo.</p>
            </div>
            <span className="text-xs text-slate-500">{visibleSuggestions.length} item(ns)</span>
          </div>
          {visibleSuggestions.map((suggestion) => {
            const investigation = suggestion.kind === 'INVESTIGATION'
            const creating = creatingSuggestionId === suggestion.id
            return (
              <div key={suggestion.id} className={investigation
                ? 'rounded-xl border border-amber-800/50 bg-amber-950/15 p-5'
                : 'rounded-xl border border-emerald-800/50 bg-emerald-950/15 p-5'}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={investigation
                        ? 'text-[11px] font-semibold text-amber-300 border border-amber-800 rounded-full px-2 py-0.5'
                        : 'text-[11px] font-semibold text-emerald-300 border border-emerald-800 rounded-full px-2 py-0.5'}>
                        {investigation ? 'Lacuna de investigação' : 'Pré-condição sustentada'}
                      </span>
                      {suggestion.linkedCodes.length > 0 && <span className="text-[11px] font-mono text-slate-400">{suggestion.linkedCodes.join(' / ')}</span>}
                    </div>
                    <h3 className="mt-2 font-semibold text-white">{suggestion.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{suggestion.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Evento: <span className="text-slate-300">{suggestion.eventTitle ?? suggestion.analysisTitle}</span></span>
                      <span>Pré-condição: <span className="text-slate-300">{suggestion.preconditionLabel}</span></span>
                      <span>Nível: <span className="text-slate-300">{suggestion.preconditionLevel}</span></span>
                    </div>
                    {suggestion.evidence.length > 0 && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">Evidência: {suggestion.evidence.join(' | ')}</p>
                    )}
                    {suggestion.eventId && <a href={`/events/${suggestion.eventId}`} className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300">Ver evento →</a>}
                  </div>
                  <button
                    disabled={creating}
                    onClick={() => void createSuggestion(suggestion)}
                    className={investigation
                      ? 'shrink-0 rounded-lg border border-amber-700 px-3 py-2 text-xs font-medium text-amber-300 hover:border-amber-500 disabled:opacity-50'
                      : 'shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50'}
                  >
                    {creating ? 'Criando…' : investigation ? 'Criar tarefa de investigação' : 'Criar ação corretiva'}
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm mb-4">
          Erro ao carregar ações: {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((action) => {
            const badgeClass = STATUS_BADGE[action.status] ?? STATUS_BADGE.pending
            const next = STATUS_NEXT[action.status]
            const overdue = isOverdue(action.due_date, action.status)
            const isEditing = editingId === action.id

            return (
              <div key={action.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {/* Main content */}
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Badge row */}
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {STATUS_LABEL[action.status] ?? action.status}
                        </span>
                        {action.status === 'completed' && action.effectiveness_status && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EFFECTIVENESS_BADGE[action.effectiveness_status] ?? EFFECTIVENESS_BADGE.NOT_ASSESSED}`}>
                            {EFFECTIVENESS_LABEL[action.effectiveness_status] ?? action.effectiveness_status}
                          </span>
                        )}
                        {action.related_failure && (
                          <span className={action.related_failure.startsWith('INVESTIGATE:')
                            ? 'text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded'
                            : 'text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded'}>
                            {action.related_failure.startsWith('INVESTIGATE:') ? 'Investigação · ' : ''}{action.related_failure.replace('INVESTIGATE:', '')}
                          </span>
                        )}
                        {overdue && (
                          <span className="text-xs font-medium text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                            Prazo vencido
                          </span>
                        )}
                      </div>

                      {/* Title + description */}
                      <h3 className="font-semibold text-white mb-1">{action.title}</h3>
                      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {action.event_title && <span>Evento: <span className="text-slate-300">{action.event_title}</span></span>}
                        {action.precondition_category && (
                          <span>Pré-condição: <span className="text-slate-300">{preconditionLabel(action.precondition_category)}</span></span>
                        )}
                        {action.action_kind === 'INVESTIGATION' && <span className="text-amber-300">Tarefa de investigação</span>}
                        {action.action_kind === 'GENERAL_SAFETY' && <span className="text-emerald-300">Ação geral de Safety</span>}
                        {action.priority && (
                          <span className="text-slate-400">Prioridade: <span className="text-slate-200">{action.priority}</span></span>
                        )}
                        {action.linkage_status === 'STALE_PRECONDITION_LINK' && (
                          <span className="text-amber-300">Vínculo metodológico alterado na reanálise — revisar esta ação</span>
                        )}
                      </div>
                      {action.description && (
                        <p className="text-slate-400 text-sm leading-relaxed mb-3">{action.description}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {action.responsible ? (
                          <span>
                            Responsável: <span className="text-slate-300">{action.responsible}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Sem responsável definido</span>
                        )}
                        {action.due_date ? (
                          <span className={overdue ? 'text-red-400' : ''}>
                            Prazo: {fmtDate(action.due_date)}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Sem prazo</span>
                        )}
                        {action.status === 'completed' && action.effectiveness_review_due_date && (
                          <span>Verificar eficácia até: <span className="text-slate-300">{fmtDate(action.effectiveness_review_due_date)}</span></span>
                        )}
                        {action.status === 'completed' && action.effectiveness_notes && (
                          <span className="basis-full text-slate-500">Eficácia: {action.effectiveness_notes}</span>
                        )}
                        {action.event_id && (
                          <a
                            href={`/events/${action.event_id}`}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Ver evento →
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => (isEditing ? setEditingId(null) : startEdit(action))}
                        className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {isEditing ? 'Fechar' : 'Editar'}
                      </button>
                      {next && (
                        <button
                          onClick={() => advanceStatus(action.id, next.status)}
                          className="text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition"
                        >
                          {next.label} →
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline edit panel */}
                {isEditing && (
                  <div className="border-t border-slate-800 bg-slate-800/40 px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Editar detalhes</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Responsável</label>
                        <input
                          type="text"
                          value={editForm.responsible}
                          onChange={(e) => setEditForm((p) => ({ ...p, responsible: e.target.value }))}
                          placeholder="Nome ou cargo"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Prazo</label>
                        <input
                          type="date"
                          value={editForm.due_date}
                          onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    {action.status === 'completed' && (
                      <div className="rounded-lg border border-violet-900/60 bg-violet-950/15 p-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Verificação de eficácia</p>
                          <p className="mt-1 text-xs text-slate-500">Concluir a ação não encerra o ciclo: registre se o controle funcionou e se o risco residual ficou aceitável para acompanhamento.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Resultado</label>
                            <select
                              value={editForm.effectiveness_status}
                              onChange={(e) => setEditForm((p) => ({ ...p, effectiveness_status: e.target.value }))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                            >
                              <option value="PENDING_VERIFICATION">Aguardando verificação</option>
                              <option value="EFFECTIVE">Eficaz</option>
                              <option value="PARTIALLY_EFFECTIVE">Parcialmente eficaz</option>
                              <option value="INEFFECTIVE">Ineficaz</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Data-alvo da verificação</label>
                            <input
                              type="date"
                              value={editForm.effectiveness_review_due_date}
                              onChange={(e) => setEditForm((p) => ({ ...p, effectiveness_review_due_date: e.target.value }))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Evidência/observação de eficácia</label>
                          <textarea
                            rows={3}
                            value={editForm.effectiveness_notes}
                            onChange={(e) => setEditForm((p) => ({ ...p, effectiveness_notes: e.target.value }))}
                            placeholder="Descreva a evidência usada para verificar o resultado da ação e o risco residual."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => saveEdit(action.id)}
                        className="text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition"
                      >
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
              <p className="text-slate-400">
                {filter !== 'all'
                  ? `Nenhuma ação com status "${STATUS_LABEL[filter] ?? filter}"`
                  : 'Nenhuma ação criada ainda.'}
              </p>
              {filter === 'all' && (
                <p className="text-slate-500 text-sm">
                  O sistema exibirá acima propostas baseadas em pré-condições sustentadas e tarefas para investigar hipóteses ainda abertas. Conclua as perguntas de esclarecimento dos eventos para amadurecer essas propostas.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
