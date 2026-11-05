'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/** The invitation URL is validated by Supabase Auth before a session exists. */
export default function AcceptInvitePage() {
  const [eligible, setEligible] = useState(false)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')

  useEffect(() => {
    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user?.email_confirmed_at) {
        setEligible(true)
        setChecking(false)
      }
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (!sessionError && data.session?.user?.email_confirmed_at) setEligible(true)
    }).catch(() => {
      if (active) setError('Não foi possível validar a sessão.')
    }).finally(() => {
      if (active) setChecking(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function setAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!eligible || saving) return
    if (password.length < 8 || password.length > 1024) {
      setError('A senha deve ter entre 8 e 1024 caracteres.')
      return
    }
    if (password !== repeat) {
      setError('As senhas não coincidem.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError('Não foi possível definir a senha. Verifique o convite ou solicite outro.')
        return
      }
      setComplete(true)
      setEligible(false)
      setPassword('')
      setRepeat('')
      try { await supabase.auth.signOut({ scope: 'local' }) }
      catch { setError('Senha definida. Por segurança, encerre a sessão antes de entrar novamente.') }
    } catch {
      setError('Não foi possível definir a senha.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5">
        <h1 className="text-2xl font-bold text-white">Ativar conta HFA</h1>
        {complete ? (
          <p role="status" className="text-sm text-green-300">Senha definida. Faça login com seu email e a nova senha.</p>
        ) : checking ? (
          <p className="text-sm text-slate-400">Validando o convite...</p>
        ) : eligible ? (
          <form onSubmit={setAccountPassword} className="space-y-4">
            <p className="text-sm text-slate-400">Defina sua senha após abrir o link enviado ao seu email.</p>
            <label className="block text-sm text-slate-300">Nova senha
              <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password"
                value={password} onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white" />
            </label>
            <label className="block text-sm text-slate-300">Confirmar senha
              <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password"
                value={repeat} onChange={(event) => setRepeat(event.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white" />
            </label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={saving} className="w-full bg-blue-600 disabled:opacity-50 rounded-lg p-3 text-white">
              {saving ? 'Ativando...' : 'Definir senha'}
            </button>
          </form>
        ) : (
          <p role="alert" className="text-sm text-amber-300">Convite inválido, expirado ou ainda não processado. Abra o link novamente ou contate o suporte.</p>
        )}
        {complete && error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        <Link href="/login" className="block text-sm text-blue-400">Ir ao login</Link>
      </section>
    </main>
  )
}
