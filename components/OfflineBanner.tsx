'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'

/**
 * Amber banner that appears at the top of every dashboard page when the
 * browser thinks it's offline. Tells the user what still works (POS) and
 * what doesn't (everything else). Skipped on the POS page itself since the
 * user is already in the right place.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  const pathname = usePathname()
  if (online) return null
  const onPos = pathname === '/dashboard/pos'
  return (
    <div className="-mx-3 md:-mx-4 mb-3 px-3 md:px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-y border-amber-300 dark:border-amber-900 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
      <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 leading-snug">
        <b>You&apos;re offline.</b>{' '}
        {onPos ? (
          <>
            POS is in offline mode — sales are saved locally and will sync the moment
            you&apos;re back online. Stock counts may be slightly stale.
          </>
        ) : (
          <>
            This page needs the server. Switch to{' '}
            <Link href="/dashboard/pos" className="underline font-semibold">
              POS / Billing
            </Link>{' '}
            to keep ringing up sales — they&apos;ll queue locally and sync once the
            network is back.
          </>
        )}
      </div>
    </div>
  )
}

export default OfflineBanner
