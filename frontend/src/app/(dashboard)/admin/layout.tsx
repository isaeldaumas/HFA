'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useMe } from '@/hooks/useMe'
import {
  LayoutDashboard, Users, Package, Bot, CreditCard, Settings, ShieldAlert, Menu, X, Activity,
} from 'lucide-react'

const seraVNextDiagnosticsEnabled =
  process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED?.trim().toLowerCase() === 'true'
const seraVNextProductBetaUiEnabled =
  process.env.NEXT_PUBLIC_SERA_VNEXT_PRODUCT_BETA_UI_ENABLED?.trim().toLowerCase() === 'true'
const seraVNextCandidateUiEnabled =
  process.env.NEXT_PUBLIC_SERA_VNEXT_CANDIDATE_UI_ENABLED?.trim().toLowerCase() === 'true'
const seraShadowAdminUiEnabled =
  process.env.NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED?.trim().toLowerCase() === 'true'

const adminNav = [
  { href: '/admin', label: 'Visão Geral', icon: LayoutDashboard, exact: true },
  { href: '/admin/tenants', label: 'Usuários', icon: Users },
  { href: '/admin/plans', label: 'Planos', icon: Package },
  { href: '/admin/ai', label: 'IA', icon: Bot },
  { href: '/admin/payments', label: 'Pagamentos', icon: CreditCard },
  { href: '/admin/settings', label: 'Sistema', icon: Settings },
  ...(seraVNextProductBetaUiEnabled ? [{ href: '/admin/sera-vnext/analyses', label: 'SERA vNext Beta', icon: Activity }] : []),
  ...(seraVNextDiagnosticsEnabled ? [{ href: '/admin/sera-vnext', label: 'SERA vNext Runtime', icon: Activity, exact: true }] : []),
  ...(seraVNextCandidateUiEnabled ? [{ href: '/admin/sera-vnext/candidate', label: 'SERA Candidate', icon: Activity }] : []),
  ...(seraShadowAdminUiEnabled ? [{ href: '/admin/sera-shadow/comparisons', label: 'Shadow comparisons', icon: Activity }] : []),
]

function Sidebar({ pathname, close }: { pathname: string; close?: () => void }) {
  return (
    <aside className="w-60 shrink-0 bg-slate-950 border-r border-amber-500/20 flex flex-col h-full">
      <div className="px-4 py-5 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-amber-400" />
          <span className="text-amber-400 font-bold text-sm tracking-wide">Admin</span>
        </div>
        <p className="text-slate-500 text-[10px] mt-0.5">HFA System Panel</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {adminNav.map(item => {
          const Icon = item.icon
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                active
                  ? 'bg-amber-500/15 text-amber-300 border-r-2 border-amber-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-amber-500/20">
        <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition" onClick={close}>
          ← Voltar ao app
        </Link>
      </div>
    </aside>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const me = useMe()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!me.loading && !me.isAdmin) {
      router.replace('/dashboard')
    }
  }, [me.loading, me.isAdmin, router])

  if (me.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!me.isAdmin) return null

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="hidden md:block">
        <Sidebar pathname={pathname} />
      </div>

      <div className="flex-1 min-w-0 overflow-auto">
        <header className="md:hidden sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
            <ShieldAlert className="size-4" />
            Admin
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            className="text-slate-300 hover:text-white p-1"
            aria-label="Abrir menu admin"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
            <div className="h-full" onClick={e => e.stopPropagation()}>
              <Sidebar pathname={pathname} close={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
