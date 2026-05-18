'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Legacy redirect — Billing now lives as a tab inside Settings
 * (`/dashboard/settings?tab=billing`). Any deeplink to
 * `/dashboard/billing[?ref=…]` is forwarded so old buttons / saved
 * URLs / browser history still resolve.
 */
export default function BillingRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams?.get('ref')
    const target = ref
      ? `/dashboard/settings?tab=billing&ref=${ref}`
      : '/dashboard/settings?tab=billing'
    router.replace(target)
  }, [router, searchParams])

  return (
    <div className="py-16 flex items-center justify-center text-sm text-muted-foreground gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Settings → Billing…
    </div>
  )
}
