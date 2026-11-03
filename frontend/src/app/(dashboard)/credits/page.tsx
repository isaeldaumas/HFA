'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import Link from 'next/link'
import { useMe } from '@/hooks/useMe'
import { shouldShowConsumerCredits } from '@/lib/product/consumer-credit-visibility'

type CreditPackage = {
  id: string
  name: string
  credits: number
  price_cents: number
  stripe_price_id: string | null
  is_active: boolean
}

type CreditTransaction = {
  id: string
  created_at: string
  description: string | null
  amount: number
}

type CreditsResponse = {
  balance: number
  plan: string
  packages: CreditPackage[]
  transactions: CreditTransaction[]
}

const CARD_CLASSES = {
  default: 'bg-slate-900 border border-slate-800 rounded-xl p-6 relative',
  highlight: 'bg-slate-900 border border-blue-500 rounded-xl p-6 relative',
}

const BUTTON_CLASSES = {
  primary: 'w-full py-2 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-500 text-white',
  secondary: 'w-full py-2 rounded-lg text-sm font-medium transition bg-slate-800 hover:bg-slate-700 text-white',
  disabled: 'w-full py-2 rounded-lg text-sm font-medium bg-slate-800/70 text-slate-500 cursor-not-allowed',
}

const TRANSACTION_AMOUNT_CLASSES = {
  positive: 'px-6 py-3 text-right font-mono font-semibold text-green-400',
  negative: 'px-6 py-3 text-right font-mono font-semibold text-red-400',
}

function formatBrl(valueInCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueInCents / 100)
}

function pricePerAnalysis(valueInCents: number, credits: number): string {
  if (credits <= 0) return '—'
  return `${formatBrl(Math.round(valueInCents / credits))}/análise`
}

export default function CreditsPage() {
  const me = useMe()
  const showConsumerCredits = shouldShowConsumerCredits(me)
  const [balance, setBalance] = useState(0)
  const [plan, setPlan] = useState('free')
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!showConsumerCredits) return
    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) throw new Error('Sessão inválida')

        const res = await fetch('/api/credits', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        const payload = await res.json() as CreditsResponse | { detail?: string }
        if (!res.ok) throw new Error('detail' in payload ? payload.detail || 'Falha ao carregar créditos' : 'Falha ao carregar créditos')

        const creditsData = payload as CreditsResponse
        setBalance(creditsData.balance || 0)
        setPlan(creditsData.plan || 'free')
        setPackages(Array.isArray(creditsData.packages) ? creditsData.packages : [])
        setTransactions(Array.isArray(creditsData.transactions) ? creditsData.transactions : [])
      } catch (error) {
        console.error('[CreditsPage] Falha ao carregar créditos', error)
        toast.error(error instanceof Error ? error.message : 'Falha ao carregar créditos')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [showConsumerCredits])

  if (!showConsumerCredits) {
    return <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {me.loading ? <p className="text-slate-400">Carregando perfil...</p> : <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-xl font-semibold text-white">Área de créditos</h1>
        <p className="mt-2 text-sm text-slate-400">Esta área está disponível somente para contas de clientes.</p>
        <Link href="/dashboard" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Voltar ao Dashboard</Link>
      </div>}
    </div>
  }

  const displayBalance = plan === 'enterprise' ? 'Ilimitado' : String(balance)
  const displayAnalyses = plan === 'enterprise' ? 'análises ilimitadas' : `${balance} análises`
  const highlightPackageId = [...packages]
    .filter((pkg) => pkg.credits > 0)
    .sort((a, b) => a.price_cents / a.credits - b.price_cents / b.credits)[0]?.id

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Créditos</h1>
        <p className="text-slate-400">Cada análise SERA completa consome 1 crédito</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Plano {plan}</p>
          <p className="text-slate-400 text-sm">Saldo atual</p>
          <p className="text-4xl font-bold text-white">
            {displayBalance}
            {plan !== 'enterprise' && <span className="text-slate-400 text-xl font-normal"> créditos</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-sm">Equivale a</p>
          <p className="text-2xl font-semibold text-blue-400">{displayAnalyses}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-4">Comprar créditos</h2>
      {packages.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-10 text-sm text-slate-400">
          Nenhum pacote avulso ativo foi configurado no painel administrativo.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
          {packages.map((pkg) => {
            const isHighlight = pkg.id === highlightPackageId
            const isCheckoutReady = Boolean(pkg.stripe_price_id)
            const cardClass = isHighlight ? CARD_CLASSES.highlight : CARD_CLASSES.default
            const buttonClass = isCheckoutReady
              ? (isHighlight ? BUTTON_CLASSES.primary : BUTTON_CLASSES.secondary)
              : BUTTON_CLASSES.disabled

            return (
              <div key={pkg.id} className={cardClass}>
                {isHighlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
                    Melhor custo
                  </span>
                )}
                <h3 className="font-semibold text-white mb-1">{pkg.name}</h3>
                <p className="text-3xl font-bold text-white mb-1">
                  {pkg.credits} <span className="text-slate-400 text-base font-normal">créditos</span>
                </p>
                <p className="text-2xl font-semibold text-blue-400 mb-1">{formatBrl(pkg.price_cents)}</p>
                <p className="text-slate-500 text-xs mb-4">{pricePerAnalysis(pkg.price_cents, pkg.credits)}</p>
                <button
                  type="button"
                  disabled={!isCheckoutReady}
                  onClick={() => {
                    if (isCheckoutReady) {
                      toast.info('Checkout ainda não está implementado neste ambiente.')
                    }
                  }}
                  className={buttonClass}
                >
                  {isCheckoutReady ? 'Comprar' : 'Sem checkout'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold text-white mb-4">Histórico</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? <p className="p-6 text-slate-400">Carregando...</p> : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs text-slate-400 px-6 py-3">Data</th>
                <th className="text-left text-xs text-slate-400 px-6 py-3">Descrição</th>
                <th className="text-right text-xs text-slate-400 px-6 py-3">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-800 last:border-0">
                  <td className="px-6 py-3 text-slate-400 text-sm">
                    {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-3 text-slate-300 text-sm">{tx.description}</td>
                  <td className={tx.amount > 0 ? TRANSACTION_AMOUNT_CLASSES.positive : TRANSACTION_AMOUNT_CLASSES.negative}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm">Nenhuma transação ainda</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
