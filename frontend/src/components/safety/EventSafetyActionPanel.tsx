'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SafetyAction = {
  id: string
  title: string
  description?: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  due_date?: string | null
  responsible?: string | null
  priority?: 'low' | 'medium' | 'high' | 'critical'
  category?: string | null
  action_kind?: string | null
}

type Props = { eventId: string; canEdit: boolean }

const STATUS_LABEL: Record<SafetyAction['status'], string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

export function EventSafetyActionPanel({ eventId, canEdit }: Props) {
  const [actions, setActions] = useState<SafetyAction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    responsible: '',
    due_date: '',
    priority: 'medium' as SafetyAction['priority'],
    category: 'OUTRO',
  })

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/actions?eventId=${encodeURIComponent(eventId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => ([]))
      if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : `HTTP ${res.status}`)
      setActions((Array.isArray(json) ? json : []).filter((item) => item?.action_kind === 'GENERAL_SAFETY'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as ações de Safety.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function createAction() {
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão inválida.')
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          action_kind: 'GENERAL_SAFETY',
          title: form.title.trim(),
          description: form.description.trim() || null,
          responsible: form.responsible.trim() || null,
          due_date: form.due_date || null,
          priority: form.priority,
          category: form.category,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || json?.detail || 'Não foi possível criar a ação.')
      setForm({ title: '', description: '', responsible: '', due_date: '', priority: 'medium', category: 'OUTRO' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a ação.')
    } finally {
      setSaving(false)
    }
  }
  async function setStatus(id: string, status: SafetyAction['status']) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão inválida.')
      const res = await fetch(`/api/actions/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a ação.')
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Plano de Ações de Safety</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Ações gerais podem nascer da triagem ou avaliação de risco, mesmo quando o evento não requer análise SERA.
        </p>
      </div>

      {loading && <p className="text-xs text-slate-500">Carregando ações…</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">{STATUS_LABEL[action.status]}</span>
                  {action.priority && <span className="text-slate-500">prioridade {action.priority}</span>}
                  {action.category && <span className="text-slate-500">{action.category}</span>}
                </div>
                <p className="mt-2 text-sm font-semibold text-white">{action.title}</p>
                {action.description && <p className="mt-1 text-xs leading-relaxed text-slate-400">{action.description}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {action.responsible ? `Responsável: ${action.responsible}` : 'Sem responsável'}
                  {action.due_date ? ` · prazo ${new Date(action.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              {canEdit && action.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => void setStatus(action.id, 'in_progress')}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  Iniciar
                </button>
              )}
              {canEdit && action.status === 'in_progress' && (
                <button
                  type="button"
                  onClick={() => void setStatus(action.id, 'completed')}
                  className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                >
                  Concluir
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && actions.length === 0 && <p className="text-xs text-slate-600">Nenhuma ação geral de Safety registrada.</p>}
      </div>

      {canEdit && (
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              placeholder="Ação a ser executada"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
            <input
              value={form.responsible}
              onChange={(e) => setForm((current) => ({ ...current, responsible: e.target.value }))}
              placeholder="Responsável / área"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
            placeholder="Descrição / critério de conclusão"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={form.priority}
              onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value as SafetyAction['priority'] }))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="low">Prioridade baixa</option>
              <option value="medium">Prioridade média</option>
              <option value="high">Prioridade alta</option>
              <option value="critical">Prioridade crítica</option>
            </select>
            <select
              value={form.category}
              onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="TREINAMENTO">Treinamento</option>
              <option value="PROCEDIMENTO">Procedimento</option>
              <option value="EQUIPAMENTO">Equipamento</option>
              <option value="SUPERVISAO">Supervisão</option>
              <option value="COMUNICACAO">Comunicação</option>
              <option value="OUTRO">Outro</option>
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((current) => ({ ...current, due_date: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving || !form.title.trim()}
              onClick={() => void createAction()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Criando…' : 'Criar ação de Safety'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
