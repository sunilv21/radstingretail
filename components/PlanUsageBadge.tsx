'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'

interface SubscriptionResponse {
  organization: { plan: string }
  limits: {
    label: string
    stores: number
    warehouses: number
    users: { admin: number; manager: number; cashier: number; accountant: number; ca: number }
  }
  usage: {
    stores: number
    warehouses: number
    users: { admin: number; manager: number; cashier: number; accountant: number; ca: number }
  }
}

type Resource = 'stores' | 'warehouses' | 'users'

/**
 * Inline "X of Y used" badge. Drop on any page where the user can hit a
 * plan cap. Hides itself if the API call fails (no point spamming the
 * user with errors about a non-essential indicator).
 */
export default function PlanUsageBadge({ resource, role }: { resource: Resource; role?: string }) {
  const [data, setData] = useState<SubscriptionResponse | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem('token')) return
    api
      .get<SubscriptionResponse>('/store/subscription')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 402) return
      })
  }, [])

  if (!data) return null

  let used = 0
  let cap = 0
  let label = ''
  if (resource === 'stores') {
    used = data.usage.stores
    cap = data.limits.stores
    label = 'branches'
  } else if (resource === 'warehouses') {
    used = data.usage.warehouses
    cap = data.limits.warehouses
    label = 'warehouses'
  } else if (role) {
    const r = role.toLowerCase() as keyof typeof data.usage.users
    used = data.usage.users[r] || 0
    cap = data.limits.users[r] || 0
    label = `${role}s`
  } else {
    used = Object.values(data.usage.users).reduce((s, n) => s + n, 0)
    cap = Object.values(data.limits.users).reduce((s, n) => s + n, 0)
    label = 'users'
  }

  const pct = cap > 0 ? used / cap : 0
  const colour =
    pct >= 1
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
      : pct >= 0.8
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${colour}`}
      title={`${data.limits.label} plan · ${used} ${label} used of ${cap} allowed`}
    >
      <span>{used} / {cap}</span>
      <span className="text-[10px] opacity-70 uppercase">{label}</span>
    </span>
  )
}
