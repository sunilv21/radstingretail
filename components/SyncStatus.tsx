'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCcw, AlertTriangle } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { subscribeSync, syncNow, getSyncState, type SyncState } from '@/lib/sync'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Compact pill that lives in the sidebar footer (or anywhere). Shows:
 *   - green online + "Synced"
 *   - amber online + "N to sync" with manual sync button
 *   - rose offline + "N queued"
 */
export function SyncStatus({ className }: { className?: string }) {
  const online = useOnlineStatus()
  const [state, setState] = useState<SyncState>(getSyncState())

  useEffect(() => subscribeSync(setState), [])

  const pending = state.pending
  const hasQueued = pending > 0

  let label: string
  let tone: 'green' | 'amber' | 'rose' | 'gray'
  let Icon: typeof Wifi
  if (!online) {
    label = hasQueued ? `Offline · ${pending} queued` : 'Offline'
    tone = 'rose'
    Icon = WifiOff
  } else if (state.syncing) {
    label = 'Syncing…'
    tone = 'amber'
    Icon = RefreshCcw
  } else if (hasQueued) {
    label = `${pending} to sync`
    tone = 'amber'
    Icon = AlertTriangle
  } else {
    label = 'All synced'
    tone = 'green'
    Icon = Wifi
  }

  const toneClass = {
    green: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900',
    amber: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
    rose: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900',
    gray: 'text-muted-foreground bg-muted border-border',
  }[tone]

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
        toneClass,
        className,
      )}
      title={
        state.lastError
          ? `Last error: ${state.lastError}`
          : online
            ? 'Connected to server'
            : 'No internet — POS sales are saved locally'
      }
    >
      <Icon
        className={cn('w-3 h-3 shrink-0', state.syncing && 'animate-spin')}
      />
      <span className="truncate flex-1">{label}</span>
      {online && hasQueued && !state.syncing && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          title="Sync now"
          onClick={() => syncNow().catch(() => {})}
        >
          <RefreshCcw className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}

export default SyncStatus
