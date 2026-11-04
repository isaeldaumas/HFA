'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const [eligible, setEligible] = useState(false)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) setEligible(true)
    })
    // Recovery is allowed by an Auth event or a recovery URL plus session,
    // not by the mere presence of a logged-in account.
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const recoveryLink = hash.get('type') === 'recovery'
    void supabase.auth.getSession().then(({ data }) => {
      if (recoveryLink && data.session) setEligible(true)
    }).catch(() => {
      setError('Não foi possível verificar o link.')
    }).finally(() => setChecking(false))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function changePassword(event: FormEvent<HTMLFormElement>) {
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
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) {
        setError('A senha não foi alterada. Solicite outro link caso ele tenha expirado.')
        return
      }
      setComplete(true)
      setEligible(false)
      setPassword('')
      setRepeat('')
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) setError('Senha alterada, mas não foi possível encerrar a sessão neste navegador.')
      } catch {
        setError('Senha alterada, mas não foi possível encerrar a sessão neste navegador.')
      }
    } catch {
      setError('Não foi possível alterar a senha.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5">
        <h1 className="text-2xl font-bold text-white">Definir nova senha</h1>
        {complete ? (
          <div><p role="status" className="text-green-300 text-sm">Senha alterada. Faça login com a nova senha.</p>{error && <p role="alert" className="text-amber-300 text-sm mt-2">{error}</p>}</div>
        ) : checking ? (
          <p className="text-slate-400 text-sm">Verificando link de recuperação...</p>
        ) : eligible ? (
          <form onSubmit={changePassword} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Nova senha
              <input type="password" minLength={8} maxLength={1024} autoComplete="new-password"
                required value={password} onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white" />
            </label>
            <label className="block text-sm text-slate-300">
              Confirme a senha
              <input type="password" minLength={8} maxLength={1024} autoComplete="new-password"
                required value={repeat} onChange={(event) => setRepeat(event.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white" />
            </label>
            {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
            <button disabled={saving} type="submit"
              className="w-full bg-blue-600 disabled:opacity-50 py-3 rounded-lg text-white">
              {saving ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </form>
        ) : (
          <p role="alert" className="text-amber-300 text-sm">
            Link inválido ou expirado. Solicite um novo link de recuperação.
          </p>
        )}
        <Link href={complete ? '/login' : '/forgot-password'} className="block text-blue-400 text-sm">
          {complete ? 'Ir ao login' : 'Solicitar novo link'}
        </Link>
      </section>
    </main>
  )
}
