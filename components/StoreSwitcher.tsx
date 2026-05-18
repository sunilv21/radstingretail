'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronsUpDown, Check, Warehouse } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/lib/types'

interface Store {
  _id: string
  name: string
  code?: string
  type?: 'store' | 'warehouse'
}

/**
 * Dropdown that lets a multi-store user switch their active branch. Hidden
 * for users with only one store. On switch, calls /auth/switch-store/:id,
 * which returns a freshly signed JWT scoped to the new store; we save it
 * back to localStorage and reload so every cached query refetches.
 */
export function StoreSwitcher({ className }: { className?: string }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem('token')) return
    // The store grants must be read live from the database. localStorage gets
    // stale the moment an admin assigns the user to another branch or a new
    // branch is created, so we always hit /auth/me on mount and render
    // strictly off the server response.
    ;(async () => {
      try {
        const fresh = await api.get<{ user: AuthUser }>('/auth/me')
        if (fresh?.user) {
          window.localStorage.setItem('user', JSON.stringify(fresh.user))
          setUser(fresh.user)
        }
      } catch {
        /* offline / 401 — leave the switcher hidden */
      }
    })()
  }, [])

  if (!user) return null
  const stores = user.stores || []
  if (stores.length === 0) return null
  const current = stores.find((s) => String(s._id) === String(user.storeId)) || stores[0]
  const multi = stores.length > 1
  const currentIsWarehouse = current.type === 'warehouse'
  // Drives the chip colour and icon. Warehouse mode is visually distinct so
  // the operator never confuses "I'm at the warehouse" with "I'm at a store"
  // — they are very different operational surfaces (no POS, no GST, etc.).
  const CurrentIcon = currentIsWarehouse ? Warehouse : Building2

  const switchTo = async (storeId: string) => {
    if (String(storeId) === String(user.storeId)) {
      setOpen(false)
      return
    }
    setSwitching(true)
    try {
      const res = await api.post<{ token: string; user: AuthUser }>(
        `/auth/switch-store/${storeId}`,
      )
      window.localStorage.setItem('token', res.token)
      window.localStorage.setItem('user', JSON.stringify(res.user))
      toast.success(`Switched to ${stores.find((s) => s._id === storeId)?.name}`)
      // Hard reload so every page-level fetch (products, sales, …) refetches
      // against the new store. Avoids stale state across the app.
      window.location.reload()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not switch store')
      setSwitching(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => multi && setOpen((v) => !v)}
        disabled={switching || !multi}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[12px]',
          // Warehouse mode wraps the switcher in a violet halo so the user
          // can tell at a glance what kind of branch is active.
          currentIsWarehouse
            ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
            : 'bg-background',
          multi ? 'hover:bg-accent cursor-pointer' : 'cursor-default opacity-90',
        )}
        title={multi ? 'Switch active branch' : 'Active branch'}
      >
        <CurrentIcon
          className={cn(
            'w-3.5 h-3.5',
            currentIsWarehouse ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
          )}
        />
        <span className="flex-1 text-left truncate">
          {current.code ? `${current.code} · ` : ''}
          {current.name}
        </span>
        {currentIsWarehouse && (
          <span className="text-[9px] uppercase font-semibold tracking-wide text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 px-1 rounded">
            WH
          </span>
        )}
        {multi && <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && multi && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 z-50 rounded-md border bg-popover shadow-lg overflow-hidden">
            {stores.map((s) => {
              const active = String(s._id) === String(user.storeId)
              const isWarehouse = s.type === 'warehouse'
              const RowIcon = isWarehouse ? Warehouse : Building2
              return (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => switchTo(s._id)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-left',
                    active ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30' : 'hover:bg-accent',
                  )}
                >
                  <Check className={cn('w-3.5 h-3.5', active ? 'opacity-100' : 'opacity-0')} />
                  <RowIcon
                    className={cn(
                      'w-3.5 h-3.5',
                      isWarehouse ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                    )}
                  />
                  <span className="flex-1 truncate">
                    {s.code ? `${s.code} · ` : ''}
                    {s.name}
                  </span>
                  {isWarehouse && (
                    <span className="text-[9px] uppercase font-semibold tracking-wide text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 px-1 rounded">
                      WH
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default StoreSwitcher
