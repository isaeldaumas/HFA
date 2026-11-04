'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: new URL('/update-password', window.location.origin).toString() },
      )
      if (authError) {
        setError(authError.status === 429
          ? 'Muitas solicitações. Aguarde antes de tentar novamente.'
          : 'O serviço de recuperação está indisponível. Tente novamente mais tarde.')
      } else {
        // Do not disclose whether this email belongs to an account.
        setSubmitted(true)
      }
    } catch {
      setError('Não foi possível contatar o serviço de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5">
        <h1 className="text-2xl font-bold text-white">Recuperar senha</h1>
        <p className="text-sm text-slate-400">
          Solicite um link de recuperação. O recebimento depende do serviço de email configurado.
        </p>
        {submitted ? (
          <p role="status" className="text-sm text-green-300">
            Solicitação aceita. Se o endereço estiver cadastrado e puder receber mensagens, verifique a caixa de entrada e spam.
          </p>
        ) : (
          <form onSubmit={requestRecovery} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Email
              <input type="email" autoComplete="email" required maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white" />
            </label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 disabled:opacity-50 py-3 rounded-lg text-white">
              {loading ? 'Solicitando...' : 'Solicitar recuperação'}
            </button>
          </form>
        )}
        <Link href="/login" className="block text-blue-400 text-sm">Voltar ao login</Link>
      </section>
    </main>
  )
}
