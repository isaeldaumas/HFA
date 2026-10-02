'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiCall } from '@/lib/api'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', company_name: '', slug: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'company_name' ? { slug: value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') } : {})
    }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiCall('/auth/register', { method: 'POST', body: JSON.stringify(form) })
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (signInError) {
        router.push('/login?registered=true')
        return
      }
      router.push('/onboarding')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
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

          <form onSubmit={handleRegister} className="space-y-4">
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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Senha</label>
            <input name="password" type="password" value={form.password} onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="mínimo 8 caracteres" minLength={8} required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-lg font-medium transition">
            {loading ? 'Criando conta...' : 'Criar conta grátis'}
          </button>
          </form>

          <p className="text-center text-slate-400 text-sm">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-400 hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
