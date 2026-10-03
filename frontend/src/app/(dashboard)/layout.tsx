'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  ClipboardList,
  BarChart2,
  BookOpen,
  Settings,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ensureOAuthTenant } from '@/lib/ensure-tenant'
import { useT } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useMe } from '@/hooks/useMe'

/* ── Nav config ─────────────────────────────────────────────── */
type NavItem = {
  href: string
  labelKey: string
  icon: React.ElementType
  cta?: boolean
}

type NavGroup = {
  labelKey: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.groupAnalysis',
    items: [
      { href: '/dashboard',    labelKey: 'nav.dashboard',   icon: LayoutDashboard },
      { href: '/safety',       labelKey: 'nav.safety',      icon: ShieldCheck },
      { href: '/events',       labelKey: 'nav.events',      icon: FileText },
      { href: '/actions',      labelKey: 'nav.actions',     icon: ClipboardList },
      { href: '/risk-profile', labelKey: 'nav.riskProfile', icon: BarChart2 },
    ],
  },
  {
    labelKey: 'nav.groupMethodology',
    items: [
      { href: '/learn',          labelKey: 'nav.methodology', icon: BookOpen },
      { href: '/sera/interview', labelKey: 'nav.interview',   icon: ClipboardCheck },
    ],
  },
]

const bottomNav: NavItem[] = [
  { href: '/settings/ai', labelKey: 'nav.settings', icon: Settings },
  { href: '/credits',     labelKey: 'nav.credits',  icon: CreditCard },
]

/* ── Breadcrumb map ─────────────────────────────────────────── */
const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/safety':       'Safety Intelligence',
  '/events':       'Eventos',
  '/events/new':   'Novo Evento',
  '/actions':      'Ações Corretivas',
  '/risk-profile': 'Perfil de Risco',
  '/settings/ai':       'Configurações › IA',
  '/credits':           'Créditos',
  '/learn':                  'Metodologia SERA',
  '/learn/pipeline':         'Metodologia SERA › Pipeline',
  '/learn/perception':       'Metodologia SERA › Percepção',
  '/learn/objective':        'Metodologia SERA › Objetivo',
  '/learn/action':           'Metodologia SERA › Ação',
  '/learn/codes':            'Metodologia SERA › Glossário',
  '/sera/interview':         'Coleta de Evidências SERA',
}

function useBreadcrumb(pathname: string): { label: string; href?: string }[] {
  if (ROUTE_LABELS[pathname]) {
    return [{ label: ROUTE_LABELS[pathname] }]
  }
  if (pathname.startsWith('/events/new')) {
    return [{ label: 'Eventos', href: '/events' }, { label: 'Novo Evento' }]
  }
  if (pathname.match(/^\/events\/[^/]+$/)) {
    const id = pathname.split('/').pop()!
    return [{ label: 'Eventos', href: '/events' }, { label: `Evento ${id.slice(0, 8)}…` }]
  }
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((seg, i) => ({
    label: seg.charAt(0).toUpperCase() + seg.slice(1),
    href: i < segments.length - 1 ? '/' + segments.slice(0, i + 1).join('/') : undefined,
  }))
}

/* ── Sidebar nav item ───────────────────────────────────────── */
function NavLink({ item, active, onClick }: { item: NavItem & { label: string }; active: boolean; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
        active
          ? 'bg-hfa-accent-subtle text-hfa-accent border-r-2 border-hfa-accent'
          : 'text-hfa-text-muted hover:bg-hfa-bg-muted hover:text-hfa-text',
      ].join(' ')}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  )
}

/* ── Sidebar ────────────────────────────────────────────────── */
function Sidebar({
  pathname,
  userEmail,
  onLogout,
  onNav,
}: {
  pathname: string
  userEmail: string
  onLogout: () => void
  onNav?: () => void
}) {
  const t = useT()
  const me = useMe()
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'US'
  const noCredits = !me.loading && !me.isUnlimited && me.credits === 0

  return (
    <aside className="flex h-full w-60 flex-col bg-hfa-bg-subtle border-r border-hfa-border">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-hfa-border">
        <Link href="/dashboard" onClick={onNav} className="block">
          <div className="text-xl font-bold text-hfa-text tracking-tight">HFA</div>
          <div className="text-[10px] text-hfa-text-subtle uppercase tracking-widest mt-0.5">
            SERA Analysis
          </div>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={group.labelKey} className={gi > 0 ? 'pt-4' : ''}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600 select-none">
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={{ ...item, label: t(item.labelKey) }}
                active={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                onClick={onNav}
              />
            ))}
          </div>
        ))}

        {/* New Event CTA */}
        <div className="pt-2 pb-1">
          {noCredits ? (
            <div className="mx-0 px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-500 text-sm font-medium rounded-lg text-center cursor-not-allowed select-none">
              <FilePlus className="size-4 inline mr-2 opacity-50" />
              {t('nav.newAnalysis')}
            </div>
          ) : (
            <Link
              href="/events/new"
              onClick={onNav}
              className="flex items-center justify-center gap-2 mx-0 px-4 py-2.5 bg-hfa-accent hover:bg-hfa-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FilePlus className="size-4" />
              {t('nav.newAnalysis')}
            </Link>
          )}
        </div>

        {/* Credits indicator for free plan */}
        {!me.loading && !me.isUnlimited && (
          <div className={`mx-1 px-3 py-2 rounded-lg text-xs ${noCredits ? 'bg-red-950/40 border border-red-900/50' : 'bg-slate-800/60'}`}>
            {noCredits ? (
              <p className="text-red-400 leading-snug">
                Você usou todas as suas análises gratuitas.{' '}
                <Link href="/credits" onClick={onNav} className="underline hover:text-red-300">
                  Ver planos
                </Link>
              </p>
            ) : (
              <p className="text-slate-400">
                <span className="text-white font-semibold">{String(me.credits)}</span>{' '}
                análise{me.credits !== 1 ? 's' : ''} restante{me.credits !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-3 border-t border-hfa-border space-y-0.5">
        {me.isAdmin && (
          <Link
            href="/admin"
            onClick={onNav}
            className={[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              pathname === '/admin' || pathname.startsWith('/admin/')
                ? 'bg-amber-500/15 text-amber-300 border-r-2 border-amber-400'
                : 'text-amber-300/80 hover:bg-amber-500/10 hover:text-amber-200',
            ].join(' ')}
          >
            <ShieldAlert className="size-4 shrink-0" />
            Admin
          </Link>
        )}
        {bottomNav.map((item) => (
          <NavLink
            key={item.href}
            item={{ ...item, label: t(item.labelKey) }}
            active={pathname === item.href}
            onClick={onNav}
          />
        ))}
      </div>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-hfa-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <div className="size-8 rounded-full bg-hfa-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            {me.isAdmin && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-bold px-1 rounded leading-tight">
                Admin
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-hfa-text-muted truncate">{userEmail}</p>
            {!me.loading && me.isUnlimited && (
              <p className="text-[10px] text-amber-400/80 font-medium">Enterprise</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-xs text-hfa-text-subtle hover:text-hfa-text transition py-1"
          >
            <LogOut className="size-3.5" />
            {t('nav.logout')}
          </button>
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  )
}

/* ── Topbar ─────────────────────────────────────────────────── */
function Topbar({
  pathname,
  userEmail,
  onMenuClick,
}: {
  pathname: string
  userEmail: string
  onMenuClick: () => void
}) {
  const crumbs = useBreadcrumb(pathname)
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'US'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b border-hfa-border bg-hfa-bg/95 backdrop-blur-sm px-4 gap-3">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden rounded-lg p-1.5 text-hfa-text-muted hover:bg-hfa-bg-muted hover:text-hfa-text transition"
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex-1 flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="size-3.5 text-hfa-text-subtle shrink-0" />}
            {crumb.href ? (
              <Link href={crumb.href} className="text-hfa-text-muted hover:text-hfa-text transition truncate">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-hfa-text font-medium truncate">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* User avatar */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="size-8 rounded-full bg-hfa-accent text-white text-xs font-bold flex items-center justify-center"
          title={userEmail}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}

/* ── Root layout ────────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push('/login')
      } else {
        setUserEmail(data.session.user.email ?? '')
        try {
          await ensureOAuthTenant()
        } catch (bootstrapErr) {
          console.error('[dashboard/layout] tenant bootstrap blocked', {
            reason: bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr),
            source: 'oauth_bootstrap',
          })
          await supabase.auth.signOut()
          router.push('/login?error=tenant')
        }
      }
    })
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-hfa-bg flex">
      {/* ── Desktop sidebar ──────────────────────────── */}
      <div className="hidden md:flex md:w-60 md:shrink-0">
        <Sidebar
          pathname={pathname}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
      </div>

      {/* ── Mobile drawer overlay ─────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-hfa-bg/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 flex w-60 animate-in slide-in-from-left duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)]">
            <Sidebar
              pathname={pathname}
              userEmail={userEmail}
              onLogout={handleLogout}
              onNav={() => setMobileOpen(false)}
            />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-1 text-hfa-text-muted hover:text-hfa-text"
              aria-label="Fechar menu"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content area ─────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          pathname={pathname}
          userEmail={userEmail}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
