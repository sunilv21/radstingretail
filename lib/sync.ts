/**
 * Outbox sync engine.
 *
 * Drains pending offline mutations FIFO. Triggered by:
 *   - the browser firing the `online` event (network just came back),
 *   - the page tab regaining focus (user came back to the app),
 *   - a 30-second interval as a long-tail safety net,
 *   - explicit calls from UI code (`syncNow()`).
 *
 * One drain at a time — re-entrant calls coalesce into a single in-flight job.
 */

import { api, ApiError } from './api'
import {
  outboxList,
  outboxRemove,
  outboxUpdate,
  type OutboxItem,
} from './offline-db'
import type { Sale } from './types'

const DRAIN_INTERVAL_MS = 30_000

let inFlight: Promise<DrainResult> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let booted = false

export interface DrainResult {
  attempted: number
  succeeded: number
  failed: number
  pending: number
  errors: { id: string; message: string }[]
}

type Listener = (state: SyncState) => void
export interface SyncState {
  syncing: boolean
  pending: number
  lastDrainAt: number | null
  lastError: string | null
}

let state: SyncState = {
  syncing: false,
  pending: 0,
  lastDrainAt: null,
  lastError: null,
}
const listeners = new Set<Listener>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const fn of listeners) {
    try {
      fn(state)
    } catch {
      /* listener errors don't kill the sync engine */
    }
  }
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

export async function refreshPendingCount(): Promise<number> {
  const items = await outboxList().catch(() => [])
  setState({ pending: items.length })
  return items.length
}

/**
 * Drain the outbox FIFO. Coalesces concurrent calls — if a drain is already
 * running, returns the same promise.
 */
export async function syncNow(): Promise<DrainResult> {
  if (inFlight) return inFlight
  inFlight = doDrain().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doDrain(): Promise<DrainResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const pending = await refreshPendingCount()
    return { attempted: 0, succeeded: 0, failed: 0, pending, errors: [] }
  }

  const items = await outboxList().catch(() => [] as OutboxItem[])
  if (items.length === 0) {
    setState({ pending: 0, lastDrainAt: Date.now() })
    return { attempted: 0, succeeded: 0, failed: 0, pending: 0, errors: [] }
  }

  setState({ syncing: true, pending: items.length, lastError: null })
  const errors: { id: string; message: string }[] = []
  let succeeded = 0
  let failed = 0

  for (const item of items) {
    try {
      await outboxUpdate(item.id, {
        status: 'syncing',
        attempts: item.attempts + 1,
        lastAttemptAt: Date.now(),
      })
      await replay(item)
      await outboxRemove(item.id)
      succeeded += 1
    } catch (err) {
      failed += 1
      const message = errorMessage(err)
      const isPermanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.code !== 'TIMEOUT'
      await outboxUpdate(item.id, {
        status: isPermanent ? 'failed' : 'pending',
        lastError: message.slice(0, 240),
      })
      errors.push({ id: item.id, message })
      // 5xx / network — stop here, retry on the next drain. Don't keep hammering
      // a backend that's clearly down.
      if (!isPermanent) break
    }
  }

  const pending = await refreshPendingCount()
  setState({
    syncing: false,
    pending,
    lastDrainAt: Date.now(),
    lastError: errors.length ? errors[errors.length - 1].message : null,
  })

  return { attempted: items.length, succeeded, failed, pending, errors }
}

async function replay(item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case 'sales:create':
      await api.post<Sale>('/sales', item.payload, { timeout: 60_000 })
      return
    default:
      throw new Error(`Unknown outbox kind: ${(item as OutboxItem).kind}`)
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `[${err.code}] ${err.message}`
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Wire up automatic drains. Idempotent — safe to call from a top-level
 * provider/effect; subsequent calls are no-ops.
 */
export function bootSync(): void {
  if (booted || typeof window === 'undefined') return
  booted = true
  refreshPendingCount().catch(() => {})

  const tryDrain = () => {
    if (navigator.onLine) syncNow().catch(() => {})
  }
  window.addEventListener('online', tryDrain)
  window.addEventListener('focus', tryDrain)
  // Tab visibility — also a good signal to drain.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryDrain()
  })
  if (timer) clearInterval(timer)
  timer = setInterval(tryDrain, DRAIN_INTERVAL_MS)
}
