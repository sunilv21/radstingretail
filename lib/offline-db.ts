/**
 * Tiny promise wrapper around IndexedDB. Three object stores back the offline
 * mode:
 *
 *   outbox   — pending mutations waiting to be replayed when network returns
 *   products — last-known-good product master for offline POS lookup
 *   meta     — bookkeeping (last sync timestamps, product cache version, …)
 *
 * Kept dependency-free on purpose. Raw IDB is verbose but tree-shakes to zero
 * runtime weight for users who never go offline.
 */

import type { Product } from './types'

const DB_NAME = 'radsting-pos-offline'
const DB_VERSION = 1

export interface OutboxItem {
  /** Stable client UUID — also used as the request's idempotencyKey. */
  id: string
  /** Logical operation. Today only "sales:create" is supported. */
  kind: 'sales:create'
  /** Body to POST. Stored verbatim. */
  payload: unknown
  /** Snapshot of human-readable info so we can surface what's queued. */
  display: { invoiceLabel: string; grandTotal: number; customer?: string }
  createdAt: number
  /** Increments on every retry. */
  attempts: number
  /** Last error we saw (truncated) so the UI can surface it. */
  lastError?: string
  /** Wall-clock time of the last attempt. */
  lastAttemptAt?: number
  status: 'pending' | 'syncing' | 'failed'
}

let dbPromise: Promise<IDBDatabase> | null = null

function isClient() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

async function getDB(): Promise<IDBDatabase> {
  if (!isClient()) {
    throw new Error('IndexedDB not available in this environment')
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('outbox')) {
        const s = db.createObjectStore('outbox', { keyPath: 'id' })
        s.createIndex('createdAt', 'createdAt')
        s.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: '_id' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'))
  })
  return dbPromise
}

/** Convert an IDBRequest into a Promise. */
function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T> | T,
): Promise<T> {
  const db = await getDB()
  return new Promise<T>((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    const t = db.transaction(names, mode)
    const stores: Record<string, IDBObjectStore> = {}
    for (const n of names) stores[n] = t.objectStore(n)
    let result: T
    Promise.resolve()
      .then(() => fn(stores))
      .then((r) => {
        result = r
      })
      .catch(reject)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Transaction aborted'))
  })
}

// -------------------- outbox --------------------

export async function outboxAdd(item: OutboxItem): Promise<void> {
  await tx('outbox', 'readwrite', ({ outbox }) => reqToPromise(outbox.put(item)))
}

export async function outboxList(): Promise<OutboxItem[]> {
  return tx('outbox', 'readonly', async ({ outbox }) => {
    const all = await reqToPromise<OutboxItem[]>(outbox.getAll())
    return all.sort((a, b) => a.createdAt - b.createdAt)
  })
}

export async function outboxCount(): Promise<number> {
  return tx('outbox', 'readonly', ({ outbox }) => reqToPromise(outbox.count()))
}

export async function outboxUpdate(
  id: string,
  patch: Partial<OutboxItem>,
): Promise<void> {
  await tx('outbox', 'readwrite', async ({ outbox }) => {
    const current = await reqToPromise<OutboxItem | undefined>(outbox.get(id))
    if (!current) return
    await reqToPromise(outbox.put({ ...current, ...patch }))
  })
}

export async function outboxRemove(id: string): Promise<void> {
  await tx('outbox', 'readwrite', ({ outbox }) => reqToPromise(outbox.delete(id)))
}

// -------------------- products cache --------------------

export async function cacheProducts(products: Product[]): Promise<void> {
  if (!products?.length) return
  await tx('products', 'readwrite', async ({ products: store }) => {
    // Clear and replace — keeps the cache in sync with the latest server view.
    await reqToPromise(store.clear())
    for (const p of products) {
      await reqToPromise(store.put(p))
    }
  })
  await metaSet('products:lastSync', Date.now())
}

export async function getCachedProducts(): Promise<Product[]> {
  if (!isClient()) return []
  return tx('products', 'readonly', ({ products }) =>
    reqToPromise<Product[]>(products.getAll()),
  )
}

/** Find a single cached product by barcode, qrCode, SKU or name (case-insensitive substring). */
export async function findCachedProduct(code: string): Promise<Product | null> {
  if (!code) return null
  const all = await getCachedProducts()
  const c = String(code).trim().toLowerCase()
  // 1. Exact match on barcode / qrCode / SKU
  const exact = all.find(
    (p) =>
      p.barcode?.toLowerCase() === c ||
      p.qrCode?.toLowerCase() === c ||
      p.sku?.toLowerCase() === c,
  )
  if (exact) return exact
  // 2. Substring on name
  const sub = all.find((p) => p.name?.toLowerCase().includes(c))
  return sub || null
}

/** Locally decrement stock on a cached product so subsequent offline lookups
 *  reflect what's been already-rung-up but not yet synced. */
export async function adjustCachedStock(
  productId: string,
  delta: number,
): Promise<void> {
  await tx('products', 'readwrite', async ({ products }) => {
    const p = await reqToPromise<Product | undefined>(products.get(productId))
    if (!p) return
    const next: Product = { ...p, stock: Math.max(0, Number(p.stock || 0) + delta) }
    await reqToPromise(products.put(next))
  })
}

// -------------------- meta --------------------

export async function metaSet(key: string, value: unknown): Promise<void> {
  await tx('meta', 'readwrite', ({ meta }) =>
    reqToPromise(meta.put({ key, value, updatedAt: Date.now() })),
  )
}

export async function metaGet<T = unknown>(key: string): Promise<T | null> {
  if (!isClient()) return null
  return tx('meta', 'readonly', async ({ meta }) => {
    const row = await reqToPromise<{ value: T } | undefined>(meta.get(key))
    return row?.value ?? null
  })
}

// -------------------- ids --------------------

/** RFC4122 v4-ish UUID — good enough for client-generated idempotency keys. */
export function uuid(): string {
  // crypto.randomUUID is widely supported, fall back if unavailable.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: 16 random bytes mashed into v4-shaped hex.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
