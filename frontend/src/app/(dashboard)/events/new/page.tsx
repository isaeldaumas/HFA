'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/lib/api'
import { TrialUsageCard } from '@/components/product/TrialUsageCard'
import DocumentUpload from '@/components/sera/DocumentUpload'
import { useMe } from '@/hooks/useMe'
import { useI18n } from '@/lib/i18n'

type Tab = 'text' | 'upload'

const PROGRESS_STEPS = [
  { delay: 0,     text: 'Iniciando análise SERA...' },
  { delay: 8000,  text: 'Resumindo o evento e extraindo contexto...' },
  { delay: 15000, text: 'Identificando o ponto de fuga da operação segura...' },
  { delay: 22000, text: 'Classificando falhas de percepção, objetivo e ação...' },
  { delay: 40000, text: 'Gerando conclusões e recomendações de segurança...' },
  { delay: 60000, text: 'Finalizando relatório...' },
]

export default function NewEventPage() {
  const router = useRouter()
  const { locale } = useI18n()
  const me = useMe()
  const noCredits = !me.loading && !me.isUnlimited && me.credits === 0
  const [tab, setTab] = useState<Tab>('text')
  const [form, setForm] = useState({
    title: '',
    raw_input: '',
    operation_type: '',
    aircraft_type: '',
    occurred_at: '',
  })
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceMeta, setSourceMeta] = useState<{ fileName: string; wordCount: number } | null>(
    null
  )
  const [showDetails, setShowDetails] = useState(false)
  const [fromInterview, setFromInterview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progressText, setProgressText] = useState('')
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  function startProgress() {
    setProgressText(PROGRESS_STEPS[0].text)
    const ids = PROGRESS_STEPS.slice(1).map(({ delay, text }) =>
      setTimeout(() => setProgressText(text), delay)
    )
    timersRef.current = ids
  }

  function clearProgress() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setProgressText('')
  }

  useEffect(() => () => clearProgress(), [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') !== 'interview') return
    let id: ReturnType<typeof setTimeout> | null = null
    try {
      const raw = sessionStorage.getItem('hfa_interview_payload')
      if (!raw) return
      const payload = JSON.parse(raw) as {
        title?: string; raw_input?: string; operation_type?: string;
        aircraft_type?: string; occurred_at?: string;
      }
      sessionStorage.removeItem('hfa_interview_payload')
      id = setTimeout(() => {
        setForm((p) => ({
          title: payload.title ?? p.title,
          raw_input: payload.raw_input ?? p.raw_input,
          operation_type: payload.operation_type ?? p.operation_type,
          aircraft_type: payload.aircraft_type ?? p.aircraft_type,
          occurred_at: payload.occurred_at ?? p.occurred_at,
        }))
        setFromInterview(true)
        if (payload.operation_type || payload.aircraft_type) setShowDetails(true)
      }, 0)
    } catch {
      // payload inválido ou sessionStorage indisponível — ignora
    }
    return () => {
      if (id) clearTimeout(id)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    startProgress()
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const url = resolveApiUrl('/events/')

      if (tab === 'upload' && sourceFile) {
        const fd = new FormData()
        fd.set('title', form.title)
        fd.set('raw_input', form.raw_input)
        fd.set('operation_type', form.operation_type)
        fd.set('aircraft_type', form.aircraft_type)
        fd.set('occurred_at', form.occurred_at)
        fd.set('locale', locale)
        const kind = sourceFile.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'
        fd.set('input_type', kind)
        fd.set('source_type', kind)
        fd.set('source_file_name', sourceMeta?.fileName || sourceFile.name)
        if (sourceMeta?.wordCount) fd.set('source_word_count', String(sourceMeta.wordCount))
        fd.set('file', sourceFile)

        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`)
        }
        clearProgress()
        router.push(`/events/${data.event_id}`)
        return
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: form.title,
          raw_input: form.raw_input,
          operation_type: form.operation_type || null,
          aircraft_type: form.aircraft_type || null,
          occurred_at: form.occurred_at || null,
          input_type: 'text',
          source_type: 'text',
          locale,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`)
      }
      clearProgress()
      router.push(`/events/${data.event_id}`)
    } catch (err: unknown) {
      clearProgress()
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
      setLoading(false)
    }
  }

  const showExtractBanner = tab === 'upload' && sourceMeta && form.raw_input.trim().length > 0

  return (
    <div className="p-8 w-full">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl px-8 py-6 flex flex-col items-center gap-4 shadow-2xl max-w-sm w-full mx-4">
            <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            <p className="text-white font-medium text-center">{progressText}</p>
            <p className="text-slate-400 text-xs text-center">
              Este processo leva entre 60 e 120 segundos.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Nova Análise SERA</h1>
        {!me.loading && (
          me.isUnlimited ? (
            <span className="text-xs text-amber-400/80 font-medium bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
              Enterprise — ilimitado
            </span>
          ) : null
        )}
      </div>
      <p className="text-slate-400 mb-8">Insira o relato do evento para análise assistida pela metodologia SERA</p>

      <div className="mb-6">
        <TrialUsageCard compact showCreateCta={false} />
      </div>

      {fromInterview && (
        <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-4">
          <p className="text-sm text-blue-300 font-medium">Dados importados da entrevista estruturada</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            O relato foi consolidado a partir da transcrição e das notas do investigador. Revise e ajuste o título e o relato antes de iniciar a análise — você tem controle total sobre o que será enviado.
          </p>
        </div>
      )}

      {noCredits && (
        <div className="mb-6 bg-red-950/40 border border-red-900/50 rounded-xl p-4 text-sm">
          <p className="text-red-300 font-medium mb-1">Este ambiente nao tem analises adicionais liberadas no momento</p>
          <p className="text-red-400/80">O trial inicial ja foi apresentado no produto. Para continuidade neste ambiente, entre em contato.</p>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => {
            setTab('text')
            setSourceFile(null)
            setSourceMeta(null)
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'text'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          ✏️ Digitar texto
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'upload'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          📄 Upload PDF/DOCX
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-400 mb-1">Título do evento *</label>
          <input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            placeholder="Ex: Falha de procedimento em turno noturno — Plataforma Norte"
            required
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className={`text-xs transition-transform ${showDetails ? 'rotate-90' : ''}`}>▶</span>
            {showDetails ? 'Ocultar detalhes adicionais' : 'Adicionar detalhes (opcional)'}
          </button>
          {showDetails && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Tipo de operação</label>
                  <input
                    value={form.operation_type}
                    onChange={(e) => setForm((p) => ({ ...p, operation_type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    placeholder="Ex: Voo offshore, cirurgia, operação industrial"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Sistema / equipamento</label>
                  <input
                    value={form.aircraft_type}
                    onChange={(e) => setForm((p) => ({ ...p, aircraft_type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    placeholder="Ex: S-76, guindaste, sala cirúrgica"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Data do evento</label>
                <input
                  type="date"
                  value={form.occurred_at}
                  onChange={(e) => setForm((p) => ({ ...p, occurred_at: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {tab === 'upload' && (
          <DocumentUpload
            onFileReady={setSourceFile}
            onExtracted={(text, meta) => {
              setForm((p) => ({ ...p, raw_input: text }))
              setSourceMeta(meta)
            }}
          />
        )}

        <div>
          <label className="block text-sm text-slate-400 mb-1">Relato do evento *</label>
          {showExtractBanner && (
            <div className="mb-2 text-xs text-amber-200/90 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
              ⚠️ Texto extraído automaticamente de {sourceMeta?.fileName}. Revise antes de
              submeter — erros de extração podem afetar a qualidade da análise.
            </div>
          )}
          <textarea
            value={form.raw_input}
            onChange={(e) => setForm((p) => ({ ...p, raw_input: e.target.value }))}
            className={`w-full border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 resize-none ${
              showExtractBanner
                ? 'bg-amber-950/25 border-amber-900/50'
                : 'bg-slate-800 border-slate-700'
            }`}
            rows={12}
            placeholder={
              tab === 'upload'
                ? 'O texto aparecerá aqui após o upload, ou digite manualmente…'
                : 'Cole aqui o relato completo do evento…'
            }
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Relatos brutos, narrativas parciais e documentos operacionais são aceitos. O sistema identifica lacunas de evidência e as sinaliza ao investigador.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || noCredits}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition text-white"
          >
            🔍 Iniciar Análise SERA
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-8 py-3 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition"
          >
            Cancelar
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-400">
          ⚡ Esta analise contara para a formacao do perfil inicial da organizacao. O relatorio
          sera gerado com apoio de IA seguindo as 7 etapas da metodologia SERA — a conclusao final e do investigador.
        </div>
      </form>
    </div>
  )
}
