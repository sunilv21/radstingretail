'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldOff } from 'lucide-react'

interface BlockInfo {
  code: 'SUBSCRIPTION_EXPIRED' | 'SUBSCRIPTION_BLOCKED'
  message: string
  status: string
  seenAt: number
}

/**
 * Banner that appears when the API returns 402. The api helper writes the
 * error to sessionStorage; this component polls it and surfaces a clear
 * "renew" message so tenants whose subscription lapsed don't see a half-broken
 * UI without explanation. Hides itself the moment a 200 response comes back.
 */
export default function SubscriptionBanner() {
  const [info, setInfo] = useState<BlockInfo | null>(null)

  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem('subscription-block')
        if (!raw) return setInfo(null)
        const parsed = JSON.parse(raw) as BlockInfo
        // If the last block seen was more than 30 s ago, assume the next
        // requests have been succeeding (vendor extended the subscription)
        // and stop showing the banner. The next 402 will rewrite the entry.
        if (Date.now() - parsed.seenAt > 30_000) {
          sessionStorage.removeItem('subscription-block')
          return setInfo(null)
        }
        setInfo(parsed)
      } catch {
        setInfo(null)
      }
    }
    read()
    const t = setInterval(read, 5_000)
    return () => clearInterval(t)
  }, [])

  if (!info) return null

  const blocked = info.code === 'SUBSCRIPTION_BLOCKED'
  return (
    <div
      className={
        blocked
          ? 'mb-3 rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-3 py-2 flex items-start gap-2 text-sm'
          : 'mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 flex items-start gap-2 text-sm'
      }
      role="alert"
    >
      {blocked ? (
        <ShieldOff className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
      ) : (
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
      )}
      <div className={blocked ? 'text-rose-900 dark:text-rose-200' : 'text-amber-900 dark:text-amber-200'}>
        <div className="font-semibold">
          {blocked ? 'Account suspended' : 'Subscription expired'}
        </div>
        <div className="text-xs mt-0.5">{info.message}</div>
      </div>
    </div>
  )
}
