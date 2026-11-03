'use client'
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export interface Me {
  plan: string
  credits: number | 'unlimited'
  role: string
  isAdmin: boolean
  isUnlimited: boolean
  verified: boolean
  loading: boolean
}

const DEFAULT: Me = {
  plan: 'free',
  credits: 0,
  role: 'member',
  isAdmin: false,
  isUnlimited: false,
  verified: false,
  loading: true,
}

const MeContext = createContext<Me | null>(null)

function useResolvedMe(): Me {
  const [me, setMe] = useState<Me>(DEFAULT)

  useEffect(() => {
    let active = true
    let latestRequest = 0

    async function refresh(token: string | null) {
      const request = ++latestRequest
      if (!token) {
        if (active) setMe({ ...DEFAULT, loading: false })
        return
      }
      if (active) setMe((current) => ({ ...current, verified: false, loading: true }))
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('me fetch failed')
        const json = await res.json()
        const isEnterprise = json.plan === 'enterprise'
        const isUnlimited = json.credits_balance === 'unlimited' || isEnterprise
        const credits = isUnlimited ? 'unlimited' : Number(json.credits_balance)
        if (active && request === latestRequest) {
          setMe({
            plan: json.plan ?? 'free',
            credits,
            role: json.role ?? 'member',
            isAdmin: json.is_admin === true,
            isUnlimited,
            verified: true,
            loading: false,
          })
        }
      } catch (error) {
        // Never display a consumer billing state when server role is unknown.
        console.error('Falha ao carregar /api/auth/me', error)
        if (active && request === latestRequest) setMe({ ...DEFAULT, loading: false })
      }
    }

    void supabase.auth.getSession().then(({ data }) => refresh(data.session?.access_token ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void refresh(session?.access_token ?? null)
      }
    })
    return () => {
      active = false
      latestRequest++
      subscription.unsubscribe()
    }
  }, [])

  return me
}

/** One verified role/plan snapshot per dashboard tree. The Sidebar and pages
 * MUST share this provider rather than independently fetching authorization. */
export function MeProvider({ children }: { children: ReactNode }) {
  const me = useResolvedMe()
  return createElement(MeContext.Provider, { value: me }, children)
}

export function useMe(): Me {
  return useContext(MeContext) ?? DEFAULT
}
