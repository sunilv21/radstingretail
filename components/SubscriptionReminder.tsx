'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, ShieldOff, Hourglass } from 'lucide-react'
import { api, ApiError } from '@/lib/api'

type SubStatus = 'trial' | 'active' | 'expired' | 'blocked'

interface SubscriptionPayload {
  organization: { id: string; name: string; plan: string }
  subscription: {
    status: SubStatus
    plan: string
    trialEndsAt: string | null
    subscriptionEndsAt: string | null
    monthlyAmount: number
    daysRemaining: number | null
    isAccessAllowed: boolean
  }
  reminderTemplate?: { trial: string; expiringSoon: string }
}

const DEFAULT_MESSAGES: Record<SubStatus, (n: number, name: string) => string> = {
  trial: (n, name) =>
    n === 0
      ? `Your free trial for ${name} ends today. Contact your software vendor to keep using the system tomorrow.`
      : `Your free trial for ${name} ends in ${n} day${n === 1 ? '' : 's'}. Contact your vendor to upgrade to a paid plan.`,
  active: (n, name) =>
    n === 0
      ? `${name}'s subscription expires today. Pay your renewal to avoid losing access tomorrow.`
      : `${name}'s subscription expires in ${n} day${n === 1 ? '' : 's'}. Pay your vendor to renew.`,
  expired: () => 'Your subscription has expired. Contact your software vendor to renew.',
  blocked: () => 'This account has been suspended. Contact your software vendor to reactivate.',
}

function fillTemplate(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

/**
 * Tenant-side subscription banner.
 * - In trial:  shown on every login, then re-suppressed until the next day.
 * - In active subscription: shown only when ≤ 7 days remain, throttled per day.
 * - Expired / blocked: shown on every page load (subscriptionGuard already
 *   blocks API calls; this banner just explains the situation).
 */
export default function SubscriptionReminder() {
  const [data, setData] = useState<SubscriptionPayload | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem('token')) return
    api
      .get<SubscriptionPayload>('/store/subscription')
      .then((d) => setData(d))
      .catch((err) => {
        // 402 = subscription expired / blocked; the dedicated SubscriptionBanner
        // already handles that path. Other errors are silent here.
        if (err instanceof ApiError && err.status !== 402) return
      })
  }, [])

  if (!data || dismissed) return null
  const { subscription: sub, organization, reminderTemplate } = data
  const days = sub.daysRemaining ?? 0
  const today = new Date().toISOString().slice(0, 10)
  const stamp = `subscription-banner-${organization.id}-${sub.status}-${today}`

  // Throttling: when active and not in the danger zone, never show. When in
  // trial or active+danger-zone, show once per day per status.
  if (sub.status === 'active' && days > 7) return null
  if (sub.status === 'expired' || sub.status === 'blocked') {
    // Let the existing SubscriptionBanner handle the hard-block UI; don't
    // double up.
    return null
  }
  if (typeof window !== 'undefined' && localStorage.getItem(stamp) === 'shown') {
    return null
  }

  const customForStatus =
    sub.status === 'trial'
      ? reminderTemplate?.trial
      : sub.status === 'active'
        ? reminderTemplate?.expiringSoon
        : ''

  const message = customForStatus
    ? fillTemplate(customForStatus, {
        days,
        plan: sub.plan,
        orgName: organization.name,
      })
    : DEFAULT_MESSAGES[sub.status](days, organization.name)

  const dismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(stamp, 'shown')
    setDismissed(true)
  }

  const tone =
    sub.status === 'trial'
      ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200'
      : 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200'

  const Icon =
    sub.status === 'trial'
      ? Hourglass
      : sub.status === 'active'
        ? Clock
        : sub.status === 'blocked'
          ? ShieldOff
          : AlertTriangle

  return (
    <div className={`mb-3 rounded-md border px-3 py-2 flex items-start gap-2 text-sm ${tone}`} role="alert">
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold capitalize">
          {sub.status === 'trial' ? `Trial · ${days}d left` : `Subscription · ${days}d left`}
        </div>
        <div className="text-xs mt-0.5">{message}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs px-2 py-0.5 rounded hover:bg-current/10"
      >
        Got it
      </button>
    </div>
  )
}
