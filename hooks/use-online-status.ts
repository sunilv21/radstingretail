'use client'

import { useEffect, useState } from 'react'

/**
 * Tracks browser online/offline status. SSR-safe — defaults to `true` on the
 * server so the first paint optimistically assumes connectivity, then
 * corrects on the client immediately after mount.
 *
 * Usage:
 *   const online = useOnlineStatus()
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Re-sync once on mount in case events fired before the listener attached.
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}

export default useOnlineStatus
