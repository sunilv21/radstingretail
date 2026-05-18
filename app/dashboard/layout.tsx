'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import ErrorBoundary from '@/components/ErrorBoundary'
import OfflineBanner from '@/components/OfflineBanner'
import SubscriptionBanner from '@/components/SubscriptionBanner'
import SubscriptionReminder from '@/components/SubscriptionReminder'
import AccountBlockedScreen from '@/components/AccountBlockedScreen'
import SubscriptionExpiredScreen from '@/components/SubscriptionExpiredScreen'
import { Toaster } from 'sonner'
import { bootSync } from '@/lib/sync'
import { api, ApiError } from '@/lib/api'

interface MeResponse {
  user: {
    name?: string
    email?: string
    role?: string
    userType?: string
    organizationId?: string | null
    organizationName?: string | null
    subscription?: {
      status: 'trial' | 'active' | 'expired' | 'blocked'
      subscriptionEndsAt?: string | null
      trialEndsAt?: string | null
      daysRemaining?: number | null
    } | null
  }
}

const VENDOR_EMAIL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_EMAIL) || null
const VENDOR_PHONE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_PHONE) || null
const VENDOR_WHATSAPP =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_WHATSAPP) || null
const VENDOR_PAY_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_PAY_URL) || null

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<{ name?: string; role?: string } | null>(null)
  const [meData, setMeData] = useState<MeResponse['user'] | null>(null)
  const [mounted, setMounted] = useState(false)
  const [blockOverride, setBlockOverride] = useState<{ status: 'blocked' | 'expired' } | null>(null)

  /**
   * Refresh /auth/me. The /auth/me route is intentionally NOT subscription
   * guarded so it returns the org's status even when blocked or expired.
   */
  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get<MeResponse>('/auth/me')
      const u = res?.user
      if (u) {
        setMeData(u)
        try {
          localStorage.setItem('user', JSON.stringify(u))
        } catch {}
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/')
      }
    }
  }, [router])

  /**
   * Probe a subscription-guarded route. We don't care about the response
   * shape here — the only side effect we need is the api client's 402
   * detection (sessionStorage write + `subscription:block` event).
   */
  const probeGuardedRoute = useCallback(async () => {
    try {
      await api.get('/store/me')
    } catch {
      /* 402 handled by api client; other errors irrelevant */
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    bootSync()
    const storedUser = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    if (!storedUser || storedUser === 'undefined' || storedUser === 'null' || !token) {
      localStorage.removeItem('user')
      localStorage.removeItem('token')
      router.push('/')
      return
    }
    let parsed: { role?: string } | null = null
    try {
      parsed = JSON.parse(storedUser)
      setUser(parsed)
    } catch {
      localStorage.removeItem('user')
      localStorage.removeItem('token')
      router.push('/')
      return
    }

    // CAs belong in /ca-portal, not the main dashboard. Bounce them so
    // the wrong sidebar / permissions don't flash before the CA portal
    // layout takes over.
    if (String(parsed?.role || '').toLowerCase() === 'ca') {
      router.push('/ca-portal')
      return
    }

    // Initial state: fetch /auth/me + probe a guarded route. Either path
    // surfaces the blocked/expired status so the lock screen activates.
    refreshMe()
    probeGuardedRoute()

    // Read any stamp left from a prior 402 — covers the case where the
    // user navigates away and back.
    try {
      const raw = sessionStorage.getItem('subscription-block')
      if (raw) {
        const parsed = JSON.parse(raw) as { code: string; seenAt: number }
        if (Date.now() - parsed.seenAt < 60_000) {
          setBlockOverride({
            status: parsed.code === 'SUBSCRIPTION_BLOCKED' ? 'blocked' : 'expired',
          })
        } else {
          sessionStorage.removeItem('subscription-block')
        }
      }
    } catch {
      /* ignore */
    }

    // Live event from api client when any 402 happens.
    const onBlock = (e: Event) => {
      const detail = (e as CustomEvent).detail as { code?: string }
      setBlockOverride({
        status: detail?.code === 'SUBSCRIPTION_BLOCKED' ? 'blocked' : 'expired',
      })
    }
    window.addEventListener('subscription:block', onBlock)

    // Periodic re-checks. Catches: vendor blocks while user is mid-session,
    // vendor extends/unblocks (re-check picks up the un-block), the user
    // returns to the tab after the laptop slept, etc.
    const POLL_MS = 30_000
    const poll = setInterval(() => {
      refreshMe()
      probeGuardedRoute()
    }, POLL_MS)

    const onFocus = () => {
      refreshMe()
      probeGuardedRoute()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('subscription:block', onBlock)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(poll)
    }
  }, [router, refreshMe, probeGuardedRoute])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('subscription-block')
    router.push('/')
  }

  // Vendor reactivated mid-session: when /auth/me reports a healthy status,
  // drop any stale 402 stamp so SubscriptionBanner hides immediately instead
  // of waiting out its 30 s TTL, and clear any local 402-event override.
  useEffect(() => {
    const s = meData?.subscription?.status
    if (s === 'active' || s === 'trial') {
      try {
        sessionStorage.removeItem('subscription-block')
      } catch {
        /* ignore */
      }
      setBlockOverride(null)
    }
  }, [meData?.subscription?.status])

  if (!mounted) return null

  // Resolve effective status. Priority: live /auth/me > 402-event override.
  // If /auth/me returns 'active' or 'trial', clear any stale override.
  const liveStatus = meData?.subscription?.status
  let effective: 'blocked' | 'expired' | null = null
  if (liveStatus === 'blocked' || liveStatus === 'expired') {
    effective = liveStatus
  } else if (liveStatus === 'active' || liveStatus === 'trial') {
    effective = null
  } else if (blockOverride) {
    effective = blockOverride.status
  }

  if (effective === 'blocked') {
    return (
      <>
        <AccountBlockedScreen
          organizationName={meData?.organizationName}
          vendorEmail={VENDOR_EMAIL}
          vendorPhone={VENDOR_PHONE}
          vendorWhatsApp={VENDOR_WHATSAPP}
          onLogout={handleLogout}
        />
        <Toaster position="top-right" richColors closeButton />
      </>
    )
  }

  if (effective === 'expired') {
    let daysSinceExpiry: number | null = null
    const sub = meData?.subscription
    const cutoff = sub?.subscriptionEndsAt || sub?.trialEndsAt || null
    if (cutoff) {
      const ms = Date.now() - new Date(cutoff).getTime()
      daysSinceExpiry = ms > 0 ? Math.floor(ms / 86_400_000) : 0
    }
    return (
      <>
        <SubscriptionExpiredScreen
          organizationName={meData?.organizationName}
          organizationId={meData?.organizationId}
          daysSinceExpiry={daysSinceExpiry}
          vendorPayUrl={VENDOR_PAY_URL}
          vendorEmail={VENDOR_EMAIL}
          vendorPhone={VENDOR_PHONE}
          vendorWhatsApp={VENDOR_WHATSAPP}
          onLogout={handleLogout}
        />
        <Toaster position="top-right" richColors closeButton />
      </>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile-only floating menu button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="lg:hidden fixed top-3 left-3 z-30 shadow-md bg-card"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <main className="flex-1 overflow-auto">
          <div className="p-3 md:p-4 pt-14 lg:pt-4">
            <OfflineBanner />
            <SubscriptionBanner />
            <SubscriptionReminder />
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}
