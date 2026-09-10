'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Me {
  plan: string
  credits: number | 'unlimited'
  role: string
  isAdmin: boolean
  isUnlimited: boolean
  loading: boolean
}

const DEFAULT: Me = {
  plan: 'free',
  credits: 0,
  role: 'member',
  isAdmin: false,
  isUnlimited: false,
  loading: true,
}

export function useMe(): Me {
  const [me, setMe] = useState<Me>(DEFAULT)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setMe({ ...DEFAULT, loading: false })
        return
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        if (!res.ok) throw new Error('me fetch failed')
        const json = await res.json()
        const isEnterprise = json.plan === 'enterprise'
        const isUnlimited = json.credits_balance === 'unlimited' || isEnterprise
        const credits = isUnlimited ? 'unlimited' : Number(json.credits_balance)
        setMe({
          plan: json.plan ?? 'free',
          credits,
          role: json.role ?? 'member',
          isAdmin: Boolean(json.is_admin),
          isUnlimited,
          loading: false,
        })
      } catch (error) {
        // Fail closed for display role/plan — never trust user_metadata as authorization source.
        console.error('Falha ao carregar /api/auth/me', error)
        setMe({ ...DEFAULT, loading: false })
      }
    })
  }, [])

  return me
}
