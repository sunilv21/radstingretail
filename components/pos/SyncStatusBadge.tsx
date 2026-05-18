'use client'

import { useEffect, useState } from 'react'
import {
  WifiOff,
  Wifi,
  Cloud,
  CloudOff,
  RefreshCcw,
  AlertCircle,
  X,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/hooks/use-online-status'
import {
  subscribeSync,
  syncNow,
  refreshPendingCount,
  type SyncState,
} from '@/lib/sync'
import { outboxList, outboxRemove, outboxUpdate, type OutboxItem } from '@/lib/offline-db'

/**
 * Sync-status indicator for the POS header. Visible always; tells the
 * cashier whether the app is online, how many sales are sitting in the
 * outbox waiting to be replayed, and surfaces failed sales with their
 * server-side error.
 *
 * The whole offline pipeline works without this component — but without
 * it the cashier has zero visibility into queued / failed sales, which
 * is the biggest UX risk of an otherwise-correct offline path.
 */
export function SyncStatusBadge() {
  const online = useOnlineStatus()
  const [sync, setSync] = useState<SyncState>({
    syncing: false,
    pending: 0,
    lastDrainAt: null,
    lastError: null,
  })
  const [open, setOpen] = useState(false)
  const [queue, setQueue] = useState<OutboxItem[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Live subscription to sync engine state — drives the pill colour + badge.
  useEffect(() => subscribeSync(setSync), [])

  // On mount, ask the engine for a fresh pending count. Belt-and-braces
  // for the case where this component renders before `bootSync` runs.
  useEffect(() => {
    refreshPendingCount().catch(() => {})
  }, [])

  // When the cashier opens the panel, load the actual queue rows.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await outboxList()
        if (!cancelled) setQueue(list)
      } catch {
        if (!cancelled) setQueue([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, sync.pending, sync.syncing, sync.lastDrainAt])

  const doSyncNow = async () => {
    setRefreshing(true)
    try {
      const result = await syncNow()
      if (result.attempted === 0) {
        toast.message('Nothing to sync')
      } else if (result.failed === 0) {
        toast.success(`Synced ${result.succeeded} sale${result.succeeded === 1 ? '' : 's'}`)
      } else {
        toast.error(
          `Synced ${result.succeeded}, ${result.failed} failed — see the queue for details`,
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  const retryOne = async (id: string) => {
    try {
      await outboxUpdate(id, { status: 'pending', lastError: undefined })
      await refreshPendingCount()
      await doSyncNow()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not retry')
    }
  }

  const removeOne = async (item: OutboxItem) => {
    const label = item.display?.invoiceLabel || item.id
    if (
      !confirm(
        `Discard "${label}" from the queue?\n\nThe sale will NOT be sent to the server. This cannot be undone.`,
      )
    ) {
      return
    }
    try {
      await outboxRemove(item.id)
      await refreshPendingCount()
      const list = await outboxList()
      setQueue(list)
      toast.success('Removed from queue')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove')
    }
  }

  // ─── Pill shape ──────────────────────────────────────────────────────
  let pillTone:
    | 'green'
    | 'amber'
    | 'red'
    | 'blue' = online ? 'green' : 'amber'
  let pillIcon = online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />
  let pillLabel = online ? 'Online' : 'Offline'
  if (sync.syncing) {
    pillTone = 'blue'
    pillIcon = <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
    pillLabel = 'Syncing…'
  } else if (sync.pending > 0) {
    pillTone = online ? 'amber' : 'amber'
    pillIcon = online ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />
    pillLabel = online ? `${sync.pending} to sync` : `${sync.pending} offline`
  }

  const toneClass = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
    amber: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
    red: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900',
    blue: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
  }[pillTone]

  const failedCount = queue.filter((i) => i.status === 'failed').length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors ${toneClass}`}
        title={
          online
            ? sync.pending > 0
              ? `${sync.pending} sale${sync.pending === 1 ? '' : 's'} queued to sync`
              : 'Connected — all sales synced'
            : 'No internet — sales will queue and sync when back online'
        }
      >
        {pillIcon}
        <span>{pillLabel}</span>
        {sync.pending > 0 && (
          <Badge className="h-4 px-1.5 text-[10px] bg-white/70 text-current border border-current/30 hover:bg-white/70">
            {sync.pending}
          </Badge>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-96 max-h-[28rem] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {/* Header */}
          <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sync status
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {online ? 'Connected' : 'Offline'}
                {sync.lastDrainAt && (
                  <> · last synced {relativeTime(sync.lastDrainAt)}</>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={doSyncNow}
                disabled={refreshing || sync.syncing || !online || sync.pending === 0}
                className="h-7 px-2"
                title={
                  !online
                    ? 'Connect to the internet first'
                    : sync.pending === 0
                      ? 'Nothing to sync'
                      : 'Push queued sales to the server now'
                }
              >
                <RefreshCcw
                  className={`w-3.5 h-3.5 mr-1 ${refreshing || sync.syncing ? 'animate-spin' : ''}`}
                />
                Sync now
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Offline banner */}
          {!online && (
            <div className="px-3 py-2 text-[11.5px] bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-900 leading-relaxed">
              You&rsquo;re offline. New sales will be saved locally and pushed to the
              server automatically when the network returns. The bill is still
              printable.
            </div>
          )}

          {/* Failed sales callout */}
          {failedCount > 0 && (
            <div className="px-3 py-2 text-[11.5px] bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-b border-red-200 dark:border-red-900 leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <b>{failedCount}</b> sale{failedCount === 1 ? '' : 's'} rejected by the
                server. Check the error, fix the data if needed, then Retry — or
                Remove if the sale should not be sent.
              </div>
            </div>
          )}

          {/* Queue */}
          {queue.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No sales queued. Every bill is on the server.
            </div>
          ) : (
            <ul className="divide-y">
              {queue.map((item) => {
                const customer = item.display?.customer
                const label = item.display?.invoiceLabel || item.id
                const total = item.display?.grandTotal ?? 0
                return (
                  <li key={item.id} className="px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-medium">{label}</span>
                          <StatusPill status={item.status} />
                          {item.attempts > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {customer ? customer + ' · ' : ''}
                          ₹{Number(total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          {' · '}created {relativeTime(item.createdAt)}
                        </div>
                        {item.lastError && (
                          <div className="mt-1 px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded border border-red-200 dark:border-red-900 text-[10.5px] font-mono break-words">
                            {item.lastError}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col gap-1">
                        {item.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => retryOne(item.id)}
                            disabled={!online}
                            title={online ? 'Retry pushing this sale' : 'Connect to retry'}
                          >
                            Retry
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-red-600"
                          onClick={() => removeOne(item)}
                          title="Discard this sale — cannot be undone"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: OutboxItem['status'] }) {
  const map: Record<OutboxItem['status'], { label: string; cls: string }> = {
    pending: {
      label: 'Queued',
      cls: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
    },
    syncing: {
      label: 'Syncing',
      cls: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
    },
    failed: {
      label: 'Rejected',
      cls: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900',
    },
  }
  const v = map[status]
  return (
    <span className={`inline-block text-[9.5px] px-1.5 py-0 rounded-full border font-semibold tracking-wide uppercase ${v.cls}`}>
      {v.label}
    </span>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-IN')
}
