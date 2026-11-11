'use client'
import { useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { apiCall } from '@/lib/api'

const turnstileSiteKey = process.env.NEXT_PUBLIC_HFA_TURNSTILE_SITE_KEY

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', company_name: '', slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteRequested, setInviteRequested] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'company_name' ? { slug: value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') } : {})
    }))
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const turnstileToken = new FormData(e.currentTarget).get('cf-turnstile-response')
    if (typeof turnstileToken !== 'string' || !turnstileToken) {
      setError('Conclua a verificação de segurança.'); return
    }
    setLoading(true)
    setError('')
    try {
      await apiCall('/auth/register', { method: 'POST', body: JSON.stringify({ ...form, turnstile_token: turnstileToken }) })
      setInviteRequested(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar convite')
    } finally {
      setLoading(false)
    }
  }

  // A public site key is required to enable the new signup UI. When absent,
  // do not present a form that cannot possibly complete verification.
  if (!turnstileSiteKey) return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
        <h1 className="text-2xl font-bold text-white">Cadastro HFA</h1>
        <p role="status" className="text-sm text-slate-300">Novos cadastros estão temporariamente indisponíveis enquanto a verificação de segurança é configurada.</p>
        <Link href="/login" className="block text-sm text-blue-400">Entrar com uma conta existente</Link>
      </section>
    </main>
  )

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-blue-400">HFA Platform</span>
          <p className="text-slate-400 mt-2">Piloto de 60 dias · até 15 análises · sem cartão</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {inviteRequested ? (
            <p role="status" className="text-sm text-green-300">
              Convite solicitado. Se o serviço de email estiver disponível, verifique sua caixa de entrada e spam para ativar a conta e definir sua senha. O pedido não comprova entrega.
            </p>
          ) : <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Seu nome</label>
            <input name="full_name" value={form.full_name} onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="Nome e sobrenome" required />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nome da empresa</label>
            <input name="company_name" value={form.company_name} onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="Taxi Aéreo Teste" required />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Identificador único</label>
            <input name="slug" value={form.slug} onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="taxi-aereo-teste" required />
            <p className="text-xs text-slate-500 mt-1">Gerado automaticamente, pode editar</p>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="seu@email.com" required />
          </div>
          {turnstileSiteKey ? (
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
          ) : <p role="alert" className="text-sm text-amber-300">Verificação de segurança indisponível.</p>}
          <button type="submit" disabled={loading || !turnstileSiteKey}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-lg font-medium transition">
            {loading ? 'Solicitando convite...' : 'Solicitar convite de acesso'}
          </button>
          </form>}

          <p className="text-center text-slate-400 text-sm">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-400 hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
