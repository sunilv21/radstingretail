'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Building2, Plus, RefreshCcw, Eye, EyeOff, Wand2, Search, Copy, Trash2, AlertTriangle, Pencil,
  CheckCircle2, UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/admin-api'
import type {
  OrgRow,
  SubStatus,
  CustomLimitsInput,
  PlatformPaymentRow,
  PlatformPaymentListResponse,
  UserAddonRow,
} from '@/lib/admin-types'
import { getEffectiveLimits, totalUserCap } from '@/lib/plan-limits'

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const STATUS_COLOURS: Record<SubStatus, string> = {
  trial: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  expired: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

export default function TenantsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SubStatus>('all')
  const [subTarget, setSubTarget] = useState<OrgRow | null>(null)
  const [editTarget, setEditTarget] = useState<OrgRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setOrgs(await api.get<OrgRow[]>('/platform/organizations'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = orgs.filter((o) => {
    if (statusFilter !== 'all' && o.subscription.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      o.name.toLowerCase().includes(q) ||
      (o.owner?.email || '').toLowerCase().includes(q) ||
      (o.owner?.name || '').toLowerCase().includes(q) ||
      (o.centralGstin || '').toLowerCase().includes(q)
    )
  })

  const toggleActive = async (org: OrgRow) => {
    const next = !org.isActive
    if (
      !window.confirm(
        next
          ? `Re-activate "${org.name}"? Their owner-admin and all staff regain access.`
          : `Block "${org.name}"? They will be locked out until you re-enable them.`,
      )
    ) return
    try {
      await api.put(`/platform/organizations/${org.id}`, { isActive: next })
      toast.success(`${org.name} ${next ? 'unblocked' : 'blocked'}`)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-rose-600" />
            Tenants
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Onboard new businesses, manage their subscriptions, block bad actors.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-1" /> New tenant
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 flex-wrap text-[11px]">
        <FilterPill label="All" count={orgs.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <FilterPill
          label="Trial"
          count={orgs.filter((o) => o.subscription.status === 'trial').length}
          active={statusFilter === 'trial'}
          onClick={() => setStatusFilter('trial')}
          tone="trial"
        />
        <FilterPill
          label="Active"
          count={orgs.filter((o) => o.subscription.status === 'active').length}
          active={statusFilter === 'active'}
          onClick={() => setStatusFilter('active')}
          tone="active"
        />
        <FilterPill
          label="Expired"
          count={orgs.filter((o) => o.subscription.status === 'expired').length}
          active={statusFilter === 'expired'}
          onClick={() => setStatusFilter('expired')}
          tone="expired"
        />
        <FilterPill
          label="Blocked"
          count={orgs.filter((o) => o.subscription.status === 'blocked').length}
          active={statusFilter === 'blocked'}
          onClick={() => setStatusFilter('blocked')}
          tone="blocked"
        />
      </div>

      {/* Search */}
      {orgs.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by org, owner email, GSTIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      )}

      <Card className="py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Owner-admin</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right" title="Stores · Warehouses · Users">Stores · Wh · Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                    {loading
                      ? 'Loading…'
                      : orgs.length === 0
                        ? 'No tenants yet. Click "New tenant" to onboard your first business.'
                        : 'No tenants match the current filter.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map((o) => {
                const sub = o.subscription
                const expiresAt = sub.status === 'active'
                  ? sub.subscriptionEndsAt
                  : sub.status === 'trial'
                    ? sub.trialEndsAt
                    : null
                return (
                  <TableRow key={o.id} className={o.isActive ? '' : 'opacity-60'}>
                    <TableCell>
                      <div className="font-medium">{o.name}</div>
                      {o.centralGstin && (
                        <div className="text-[10px] text-muted-foreground font-mono">{o.centralGstin}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {o.owner ? (
                        <div>
                          <div className="font-medium text-xs">{o.owner.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{o.owner.email}</div>
                        </div>
                      ) : <span className="text-muted-foreground italic text-xs">No owner</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase">{o.plan}</Badge></TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] uppercase ${STATUS_COLOURS[sub.status]}`}>{sub.status}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {expiresAt ? (
                        <div>
                          <div>{new Date(expiresAt).toLocaleDateString('en-IN')}</div>
                          {sub.daysRemaining !== null && (
                            <div className={`text-[10px] ${sub.daysRemaining <= 7 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                              {sub.daysRemaining}d left
                            </div>
                          )}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sub.monthlyAmount > 0 ? inr(sub.monthlyAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-[11px]"
                      title={`${o.counts.stores} stores · ${o.counts.warehouses ?? 0} warehouses · ${o.counts.users} users`}
                    >
                      {o.counts.stores} · {o.counts.warehouses ?? 0} · {o.counts.users}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(o)}
                          className="text-xs"
                          title="Edit tenant details and owner-admin"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSubTarget(o)} className="text-xs">
                          Subscription
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(o)} className="text-xs">
                          {o.isActive ? 'Block' : 'Unblock'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(o)}
                          className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
                          title="Permanently delete this tenant and all its users + stores"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {createOpen && (
        <NewTenantDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            load()
          }}
        />
      )}
      {subTarget && (
        <SubscriptionDialog
          org={subTarget}
          onClose={() => setSubTarget(null)}
          onSaved={() => {
            setSubTarget(null)
            load()
          }}
        />
      )}
      {editTarget && (
        <EditTenantDialog
          org={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            load()
          }}
        />
      )}
      {deleteTarget && (
        <DeleteTenantDialog
          org={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function DeleteTenantDialog({
  org, onClose, onDeleted,
}: {
  org: OrgRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const matches = confirmText.trim().toLowerCase() === org.name.toLowerCase()

  const submit = async () => {
    if (!matches) return
    setSubmitting(true)
    try {
      const result = await api.del<{
        deleted: boolean
        mode: string
        removed: { tenantAdmins: number; users: number; stores: number; organization: number }
      }>(
        `/platform/organizations/${org.id}?mode=permanent&confirm=${encodeURIComponent(org.name)}`,
      )
      const r = result.removed
      toast.success(
        `${org.name} permanently deleted · removed ${r.tenantAdmins} admin, ${r.users} staff, ${r.stores} stores`,
      )
      onDeleted()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not delete tenant')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <Trash2 className="w-5 h-5" />
            Permanently delete tenant
          </DialogTitle>
          <DialogDescription>
            This action <b>cannot be undone</b>. Use <b>Block</b> instead if you only want
            to suspend their access — you can unblock them later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-md p-3 text-sm space-y-1.5">
            <div className="flex items-start gap-2 text-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="font-semibold">The following will be removed from MongoDB:</div>
            </div>
            <ul className="text-xs text-rose-800 dark:text-rose-300 ml-6 list-disc space-y-0.5">
              <li>Organization &ldquo;<b>{org.name}</b>&rdquo;</li>
              <li>Owner-admin <span className="font-mono">{org.owner?.email || '(none)'}</span></li>
              <li>{org.counts.users} user account{org.counts.users === 1 ? '' : 's'}</li>
              <li>{org.counts.stores} store{org.counts.stores === 1 ? '' : 's'}</li>
              {!!org.counts.warehouses && (
                <li>{org.counts.warehouses} warehouse{org.counts.warehouses === 1 ? '' : 's'}</li>
              )}
            </ul>
            <div className="text-[11px] text-rose-700 dark:text-rose-400 mt-2 ml-6">
              Sales / ledger / GST / audit history is NOT auto-removed — those rows
              become orphans (nobody can log in to query them) and stay in MongoDB
              for compliance. Run a manual cleanup if you need to wipe them too.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Type <span className="font-mono font-bold">{org.name}</span> to confirm
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={org.name}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches && !submitting) submit()
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!matches || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {submitting ? 'Deleting…' : 'Delete forever'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilterPill({
  label, count, active, onClick, tone,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tone?: SubStatus
}) {
  const colour = tone ? STATUS_COLOURS[tone] : 'bg-muted text-foreground'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border transition-colors ${
        active ? `${colour} border-current font-semibold` : 'border-border hover:bg-accent'
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  )
}

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const all = upper + lower + digits + symbols
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (required.length < 12) required.push(pick(all))
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[required[i], required[j]] = [required[j], required[i]]
  }
  return required.join('')
}

/**
 * Read-only badge strip showing the limits a plan grants. For fixed tiers
 * (free/starter/pro) this is a static summary. For enterprise, it reflects
 * the live values from the customLimits inputs below it.
 */
function PlanLimitsPanel({
  plan, customLimits,
}: {
  plan: string
  customLimits?: CustomLimitsInput | null
}) {
  const limits = getEffectiveLimits(plan, customLimits)
  const u = limits.users
  const totalUsers = totalUserCap(limits)
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] space-y-1">
      <div className="font-semibold uppercase text-muted-foreground tracking-wide">
        {limits.label} plan limits
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span><b>{limits.stores}</b> store{limits.stores === 1 ? '' : 's'}</span>
        <span><b>{limits.warehouses}</b> warehouse{limits.warehouses === 1 ? '' : 's'}</span>
        <span><b>{totalUsers}</b> users:</span>
        <span>{u.admin} admin</span>
        <span>{u.manager} manager</span>
        <span>{u.cashier} cashier</span>
        <span>{u.accountant} accountant</span>
        <span>{u.ca} CA</span>
      </div>
    </div>
  )
}

/**
 * Enterprise-only customizer. Appears beneath the plan dropdown when
 * `plan === 'enterprise'`. The vendor sets per-resource caps; the admin
 * portal persists them as `org.customLimits` and the tenant backend reads
 * them through getEffectiveLimits().
 */
function EnterpriseLimitsInputs({
  value, onChange,
}: {
  value: CustomLimitsInput
  onChange: (v: CustomLimitsInput) => void
}) {
  const u = value.users || {}
  const setUser = (k: keyof NonNullable<CustomLimitsInput['users']>, n: number) => {
    onChange({ ...value, users: { ...u, [k]: n } })
  }
  return (
    <div className="rounded-md border-2 border-dashed border-purple-300 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 p-3 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-purple-800 dark:text-purple-300">
        Enterprise · custom caps
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Stores</Label>
          <Input
            type="number"
            min={0}
            value={value.stores ?? ''}
            onChange={(e) => onChange({ ...value, stores: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="e.g. 10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Warehouses</Label>
          <Input
            type="number"
            min={0}
            value={value.warehouses ?? ''}
            onChange={(e) => onChange({ ...value, warehouses: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="e.g. 3"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['admin', 'manager', 'cashier', 'accountant', 'ca'] as const).map((role) => (
          <div key={role} className="space-y-1">
            <Label className="text-xs capitalize">{role === 'ca' ? 'CA' : role}s</Label>
            <Input
              type="number"
              min={0}
              value={u[role] ?? ''}
              onChange={(e) => setUser(role, e.target.value === '' ? (NaN as unknown as number) : Number(e.target.value))}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-purple-700 dark:text-purple-400">
        Leave a field blank to grant unlimited (999 cap). The tenant backend
        enforces these on every store / user create attempt.
      </p>
    </div>
  )
}

/**
 * Additive user-slot grants for non-enterprise plans. Each row is a
 * role; the input is the number of EXTRA slots beyond the plan's
 * built-in cap (so the effective cap = plan default + grant). Saved
 * onto `org.customLimits.users[role]`. Same field that the
 * `user_addon` payment flow auto-bumps when a tenant pays for more
 * slots — vendor uses this dialog to grant manually (e.g. when a
 * tenant pays offline or requests a free trial of an extra seat).
 */
function UserSlotGrants({
  plan,
  value,
  onChange,
  pendingFromInbox: _pendingFromInbox,
}: {
  plan: string
  value: CustomLimitsInput
  onChange: (v: CustomLimitsInput) => void
  pendingFromInbox?: string
}) {
  void _pendingFromInbox
  const u = value.users || {}
  const ROLES = ['admin', 'manager', 'cashier', 'accountant', 'ca'] as const

  const setUser = (
    k: typeof ROLES[number],
    n: number,
  ) => {
    const next = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
    onChange({ ...value, users: { ...u, [k]: next } })
  }
  const bump = (k: typeof ROLES[number], delta: number) => {
    const cur = Number(u[k] ?? 0)
    setUser(k, cur + delta)
  }

  const planBase = getEffectiveLimits(plan, null)
  const totalGranted = ROLES.reduce((s, r) => s + Math.max(0, Number(u[r] ?? 0)), 0)

  return (
    <div className="rounded-md border bg-blue-50/40 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">
            Extra user-slot grants
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Slots added on top of the <b>{planBase.label}</b> plan&rsquo;s baseline. Auto-bumped by{' '}
            <em>user_addon</em> payments — set manually here for offline / comped grants.
          </p>
        </div>
        {totalGranted > 0 && (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            +{totalGranted} extra
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {ROLES.map((role) => {
          const baseCap = planBase.users[role]
          const granted = Math.max(0, Number(u[role] ?? 0))
          const effective = baseCap + granted
          return (
            <div key={role} className="flex items-center gap-2">
              <span className="text-[12px] capitalize w-24 shrink-0 text-muted-foreground">
                {role === 'ca' ? 'CA' : role}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums w-20 shrink-0">
                base {baseCap}
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-6 w-6 shrink-0"
                onClick={() => bump(role, -1)}
                disabled={granted <= 0}
                title="Remove a slot"
              >
                −
              </Button>
              <Input
                type="number"
                min="0"
                value={u[role] ?? ''}
                onChange={(e) => setUser(role, Number(e.target.value))}
                placeholder="0"
                className="h-7 w-16 text-center tabular-nums"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-6 w-6 shrink-0"
                onClick={() => bump(role, 1)}
                title="Add a slot"
              >
                +
              </Button>
              <span className="text-[11px] tabular-nums text-foreground/80 ml-1">
                = <b>{effective}</b> effective
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Click <b>Save changes</b> below to persist. Tenants see the new cap on their next API call.
      </p>
    </div>
  )
}

/**
 * Active + recently-expired user-slot addons granted via paid
 * `user_addon` payments. Each slot has a lifetime tied to its billing
 * cycle (monthly = 30d, yearly = 365d). This panel is read-only — the
 * vendor confirms / rejects new addon requests via the Pending
 * Requests panel above; expired entries fade out automatically once
 * they roll past `expiresAt`.
 */
function ActiveAddonsPanel({ addons }: { addons: UserAddonRow[] }) {
  if (!addons || addons.length === 0) return null
  const now = Date.now()
  const sorted = [...addons].sort(
    (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
  )
  const active = sorted.filter((a) => new Date(a.expiresAt).getTime() > now)
  const expired = sorted.filter((a) => new Date(a.expiresAt).getTime() <= now)
  const totalActive = active.reduce((s, a) => s + Number(a.quantity || 0), 0)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  const daysLeft = (iso: string) => {
    const ms = new Date(iso).getTime() - now
    return Math.max(0, Math.ceil(ms / 86_400_000))
  }

  return (
    <div className="rounded-md border bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Paid user-slot add-ons
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Time-bound slots from <em>user_addon</em> payments. Each grant counts toward
            the effective cap above only while it&rsquo;s still active.
          </p>
        </div>
        {totalActive > 0 && (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {totalActive} active
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {active.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 text-[12px] rounded border bg-background px-2 py-1.5"
          >
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
              {a.cycleMonths >= 12 ? 'Yearly' : 'Monthly'}
            </span>
            <span className="font-medium capitalize">
              +{a.quantity} × {a.role}
            </span>
            <span className="text-muted-foreground text-[11px]">
              · expires {fmtDate(a.expiresAt)}
            </span>
            <span className="ml-auto text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
              {daysLeft(a.expiresAt)}d left
            </span>
          </div>
        ))}
        {expired.slice(0, 3).map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 text-[12px] rounded border bg-muted/30 px-2 py-1.5 opacity-70"
          >
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
              Expired
            </span>
            <span className="capitalize">
              +{a.quantity} × {a.role}
            </span>
            <span className="text-muted-foreground text-[11px] ml-auto">
              ended {fmtDate(a.expiresAt)}
            </span>
          </div>
        ))}
        {expired.length > 3 && (
          <div className="text-[10px] text-muted-foreground text-center">
            +{expired.length - 3} more expired
          </div>
        )}
      </div>
    </div>
  )
}

function NewTenantDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState('')
  const [centralGstin, setCentralGstin] = useState('')
  const [plan, setPlan] = useState('starter')
  const [trialDays, setTrialDays] = useState(14)
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [customLimits, setCustomLimits] = useState<CustomLimitsInput>({})
  const [created, setCreated] = useState<{ orgName: string; ownerEmail: string; ownerPassword: string; trialDays: number } | null>(null)

  const submit = async () => {
    if (!orgName.trim()) return toast.error('Organisation name is required')
    if (!ownerName.trim()) return toast.error('Owner name is required')
    if (!ownerEmail.trim()) return toast.error('Owner email is required')
    if (ownerPassword.length < 8) return toast.error('Password must be at least 8 characters')
    setSubmitting(true)
    try {
      await api.post('/platform/organizations', {
        orgName: orgName.trim(),
        plan,
        centralGstin: centralGstin.trim().toUpperCase(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        trialDays,
        monthlyAmount: Number(monthlyAmount) || 0,
        customLimits: plan === 'enterprise' ? customLimits : undefined,
      })
      toast.success(`Tenant "${orgName.trim()}" created`)
      setCreated({ orgName: orgName.trim(), ownerEmail: ownerEmail.trim(), ownerPassword, trialDays })
      onCreated()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not create tenant')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = () => {
    if (!created) return
    const text = `Organisation: ${created.orgName}\nLogin URL: <your tenant POS app URL>\nEmail: ${created.ownerEmail}\nPassword: ${created.ownerPassword}\nTrial: ${created.trialDays} days`
    navigator.clipboard.writeText(text).then(() => toast.success('Credentials copied'))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Onboard a new tenant</DialogTitle>
          <DialogDescription>
            Creates the organisation, an owner-admin login, and starts the trial.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-3 text-sm">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                ✓ Tenant created: {created.orgName}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Trial active for {created.trialDays} days. Hand these credentials to the owner privately.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner email</Label>
              <Input readOnly value={created.ownerEmail} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Initial password</Label>
              <Input readOnly value={created.ownerPassword} className="font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={copyCredentials}>
                <Copy className="w-4 h-4 mr-1" /> Copy credentials
              </Button>
              <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Organisation name *</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Sharma General Store Pvt Ltd" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Plan</Label>
                  <select
                    className="h-9 border rounded-md px-2 bg-background w-full text-sm"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Trial (days)</Label>
                  <Input
                    type="number"
                    value={trialDays}
                    onChange={(e) => setTrialDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Monthly fee (₹)</Label>
                  <Input
                    type="number"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Plan limits readout — read-only badge for fixed tiers, live
                  reflection of customLimits for enterprise. */}
              <PlanLimitsPanel plan={plan} customLimits={plan === 'enterprise' ? customLimits : undefined} />

              {plan === 'enterprise' && (
                <EnterpriseLimitsInputs value={customLimits} onChange={setCustomLimits} />
              )}
              <div className="space-y-1">
                <Label className="text-xs">Central GSTIN (optional)</Label>
                <Input value={centralGstin} onChange={(e) => setCentralGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="07AAAAA0000A1Z5" />
              </div>

              <div className="border-t pt-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Owner-admin login</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Full name *</Label>
                    <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Rakesh Sharma" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="rakesh@sharmaco.in" />
                  </div>
                </div>
                <div className="space-y-1 mt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Initial password * (min 8 chars)</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerPassword(generateStrongPassword())
                        setShowPassword(true)
                      }}
                      className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1"
                    >
                      <Wand2 className="w-3 h-3" /> Generate strong
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="Set the owner's first-login password"
                      className="font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
                <Building2 className="w-4 h-4 mr-1" />
                {submitting ? 'Creating…' : 'Create tenant'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SubscriptionDialog({
  org, onClose, onSaved,
}: {
  org: OrgRow
  onClose: () => void
  onSaved: () => void
}) {
  const [plan, setPlan] = useState(org.plan)
  const [monthlyAmount, setMonthlyAmount] = useState(String(org.subscription.monthlyAmount || 0))
  const [vendorNote, setVendorNote] = useState(org.vendorNote || '')
  const [customLimits, setCustomLimits] = useState<CustomLimitsInput>(org.customLimits || {})
  const [reminderTrial, setReminderTrial] = useState(org.reminderTemplate?.trial || '')
  const [reminderExpiring, setReminderExpiring] = useState(org.reminderTemplate?.expiringSoon || '')
  const [submitting, setSubmitting] = useState(false)
  const [actionRunning, setActionRunning] = useState<string | null>(null)
  const [pendingPayments, setPendingPayments] = useState<PlatformPaymentRow[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // Pull this tenant's pending platform-payments — surfaces user_addon
  // requests inline so the vendor can confirm + auto-grant in one click
  // instead of jumping to the Payments tab.
  useEffect(() => {
    api
      .get<PlatformPaymentListResponse>(`/platform/payments?organizationId=${org.id}`)
      .then((res) => {
        setPendingPayments(
          (res?.payments || []).filter(
            (p) => p.status === 'pending' || p.status === 'awaiting_confirmation',
          ),
        )
      })
      .catch(() => setPendingPayments([]))
  }, [org.id])

  const confirmPayment = async (p: PlatformPaymentRow) => {
    setConfirmingId(p.id)
    try {
      await api.put(`/platform/payments/${p.id}/confirm`, {})
      toast.success(
        p.type === 'user_addon'
          ? `Granted ${p.addonQuantity} × ${p.addonRole} slot${p.addonQuantity === 1 ? '' : 's'}`
          : 'Payment confirmed',
      )
      // Mirror the cap bump locally so the editor reflects the new
      // grant immediately (server applied it; we just optimistically
      // sync the form state). Refetching the org would also work but
      // costs an extra round-trip.
      if (p.type === 'user_addon' && p.addonRole) {
        setCustomLimits((prev) => {
          const u = { ...(prev.users || {}) }
          const cur = Number(u[p.addonRole as keyof typeof u] ?? 0)
          u[p.addonRole as keyof typeof u] = cur + (p.addonQuantity || 1)
          return { ...prev, users: u }
        })
      }
      setPendingPayments((prev) => prev.filter((x) => x.id !== p.id))
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setConfirmingId(null)
    }
  }

  const sub = org.subscription
  const expiresAt = sub.status === 'active' ? sub.subscriptionEndsAt
    : sub.status === 'trial' ? sub.trialEndsAt : null

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setActionRunning(action)
    try {
      await api.post(`/platform/organizations/${org.id}/subscription`, { action, ...payload })
      toast.success('Subscription updated')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setActionRunning(null)
    }
  }

  const saveDetails = async () => {
    setSubmitting(true)
    try {
      await api.put(`/platform/organizations/${org.id}`, {
        plan,
        monthlyAmount: Number(monthlyAmount) || 0,
        vendorNote,
        // Persist customLimits regardless of plan — for `enterprise` they're
        // absolute caps, for everything else they're additive user-slot
        // grants (the same field the user_addon payment flow bumps).
        customLimits,
        reminderTemplate: { trial: reminderTrial, expiringSoon: reminderExpiring },
      })
      toast.success('Saved')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Status badge tone — drives the headline pill on the status card.
  const statusTone =
    sub.status === 'active'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : sub.status === 'trial'
        ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : sub.status === 'expired'
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-rose-50 text-rose-700 border border-rose-200'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 bg-white">
        {/* HEADER — clean, no shadcn Card chrome */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-200">
          <DialogTitle className="text-base font-semibold text-slate-900 tracking-tight">
            Subscription · {org.name}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            Owner <span className="font-mono">{org.owner?.email}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            Plan <span className="capitalize">{org.plan}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* ===== 1. STATUS OVERVIEW ===== */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Status">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide ${statusTone}`}
              >
                {sub.status}
              </span>
            </StatTile>
            <StatTile label={sub.status === 'trial' ? 'Trial ends' : 'Renews on'}>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {expiresAt
                  ? new Date(expiresAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {expiresAt ? `${sub.daysRemaining ?? 0} days remaining` : 'No expiry set'}
              </div>
            </StatTile>
            <StatTile label="Monthly fee">
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {inr(sub.monthlyAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">recurring</div>
            </StatTile>
          </div>

          {/* ===== 2. PENDING REQUESTS (only if any) ===== */}
          {pendingPayments.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200">
                <UserPlus className="w-4 h-4 text-amber-700" />
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                  Pending requests · {pendingPayments.length}
                </div>
              </div>
              <div className="divide-y divide-amber-200/60">
                {pendingPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5 bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-slate-900 truncate">
                        {p.type === 'user_addon'
                          ? `+${p.addonQuantity} × ${p.addonRole} slot${p.addonQuantity === 1 ? '' : 's'}`
                          : p.type === 'subscription'
                            ? `${p.planName || p.planCode} renewal`
                            : 'Payment'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {p.reference} · {p.status}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-semibold text-slate-900 tabular-nums">
                        {inr(p.amount)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      onClick={() => confirmPayment(p)}
                      disabled={confirmingId === p.id}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {confirmingId === p.id
                        ? 'Confirming…'
                        : p.type === 'user_addon'
                          ? 'Grant & confirm'
                          : 'Confirm'}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 text-[11px] text-amber-800 bg-amber-50">
                Confirming a <em>user_addon</em> row automatically grants the requested
                slots — no need to also tweak the editor below.
              </div>
            </section>
          )}

          {/* ===== 3. SUBSCRIPTION ACTIONS ===== */}
          <section>
            <SectionLabel>Subscription actions</SectionLabel>
            <div className="space-y-3">
              {/* Trial group */}
              <ActionRow
                title="Extend trial"
                description="Push the trial end-date forward."
              >
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() => runAction('extend_trial', { days: 7 })}>
                  + 7 days
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() => runAction('extend_trial', { days: 30 })}>
                  + 30 days
                </Button>
              </ActionRow>

              {/* Activate group */}
              <ActionRow
                title="Mark as paid"
                description={`Activates subscription at ₹${Number(monthlyAmount) || 0}/mo.`}
              >
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() =>
                    runAction('activate', {
                      months: 1,
                      monthlyAmount: Number(monthlyAmount) || 0,
                    })
                  }>
                  1 month
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() =>
                    runAction('activate', {
                      months: 12,
                      monthlyAmount: Number(monthlyAmount) || 0,
                    })
                  }>
                  12 months
                </Button>
              </ActionRow>

              {/* Extend group */}
              <ActionRow
                title="Extend subscription"
                description="Add months to an active subscription's end-date."
              >
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() => runAction('extend_subscription', { months: 1 })}>
                  + 1 month
                </Button>
                <Button variant="outline" size="sm" className="h-8" disabled={!!actionRunning}
                  onClick={() => runAction('extend_subscription', { months: 12 })}>
                  + 12 months
                </Button>
              </ActionRow>

              {/* Destructive */}
              <ActionRow
                title="Cancel subscription"
                description="Ends the subscription immediately. Tenant gets locked out on next request."
                destructive
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300"
                  disabled={!!actionRunning}
                  onClick={() => {
                    if (window.confirm(`End ${org.name}'s subscription right now?`)) {
                      runAction('cancel')
                    }
                  }}
                >
                  Cancel now
                </Button>
              </ActionRow>
            </div>
          </section>

          {/* ===== 4. PLAN, PRICING, LIMITS ===== */}
          <section>
            <SectionLabel>Plan &amp; pricing</SectionLabel>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-600">Plan</Label>
                <select
                  className="h-9 w-full border border-slate-300 rounded-md px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-600">Monthly fee (₹)</Label>
                <Input
                  type="number"
                  value={monthlyAmount}
                  onChange={(e) => setMonthlyAmount(e.target.value)}
                  className="h-9 bg-white border-slate-300 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                />
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              <Label className="text-[11px] font-medium text-slate-600">
                Vendor note <span className="text-slate-400">(private)</span>
              </Label>
              <Input
                value={vendorNote}
                onChange={(e) => setVendorNote(e.target.value)}
                placeholder="e.g. Annual contract, NET-30, paid via UPI ref XXX"
                className="h-9 bg-white border-slate-300 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
              />
            </div>

            {/* Limits + addons stack — internal panels keep their own chrome */}
            <div className="space-y-3">
              <PlanLimitsPanel plan={plan} customLimits={customLimits} />
              <ActiveAddonsPanel addons={org.userAddons || []} />
              {plan === 'enterprise' ? (
                <EnterpriseLimitsInputs value={customLimits} onChange={setCustomLimits} />
              ) : (
                <UserSlotGrants
                  plan={plan}
                  value={customLimits}
                  onChange={setCustomLimits}
                  pendingFromInbox={org.id}
                />
              )}
            </div>
          </section>

          {/* ===== 5. REMINDER TEMPLATE ===== */}
          <section>
            <SectionLabel>Reminder template <span className="text-slate-400 normal-case">(optional)</span></SectionLabel>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-600">During trial</Label>
                <Input
                  value={reminderTrial}
                  onChange={(e) => setReminderTrial(e.target.value)}
                  placeholder="e.g. {orgName}'s trial ends in {days} days. Reach out for a contract."
                  className="h-9 bg-white border-slate-300 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-600">Subscription expiring soon</Label>
                <Input
                  value={reminderExpiring}
                  onChange={(e) => setReminderExpiring(e.target.value)}
                  placeholder="e.g. {days} days left on your {plan} subscription. Renew to keep going."
                  className="h-9 bg-white border-slate-300 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Placeholders <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[10px]">{'{days}'}</code>,{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[10px]">{'{plan}'}</code>,{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[10px]">{'{orgName}'}</code>{' '}
                are substituted at display time. Leave both blank to fall back to the default copy.
              </p>
            </div>
          </section>
        </div>

        {/* STICKY FOOTER */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-slate-50 sticky bottom-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Close
          </Button>
          <Button
            onClick={saveDetails}
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Small tile used in the status overview row at the top of the dialog. */
function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  )
}

/** Section heading inside the dialog body. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
      {children}
    </div>
  )
}

/**
 * Action row — a label / description on the left, action buttons on the right.
 * Used for the trial/activate/extend/cancel rows so they all align cleanly.
 */
function ActionRow({
  title,
  description,
  destructive,
  children,
}: {
  title: string
  description: string
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border ' +
        (destructive
          ? 'border-rose-200 bg-rose-50/30'
          : 'border-slate-200 bg-white')
      }
    >
      <div className="min-w-0">
        <div className={'text-[13px] font-medium ' + (destructive ? 'text-rose-900' : 'text-slate-900')}>
          {title}
        </div>
        <div className={'text-[11px] mt-0.5 ' + (destructive ? 'text-rose-700/80' : 'text-slate-500')}>
          {description}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  )
}

/**
 * EditTenantDialog — vendor-side edit of tenant identity. Distinct from
 * SubscriptionDialog (which handles plan, limits, MRR, vendor note,
 * reminder template). This dialog handles the tenant's *who they are*
 * surface: org name, GSTIN, PAN, owner-admin name + email + (optional)
 * password reset.
 *
 * Persists in two API calls:
 *   PUT /platform/organizations/:id   { name, centralGstin, pan }
 *   PUT /platform/users/:ownerId      { name, email }
 *   PUT /platform/users/:ownerId/password   { password }   (only if set)
 */
function EditTenantDialog({
  org, onClose, onSaved,
}: {
  org: OrgRow
  onClose: () => void
  onSaved: () => void
}) {
  const [orgName, setOrgName] = useState(org.name)
  const [centralGstin, setCentralGstin] = useState(org.centralGstin || '')
  const [pan, setPan] = useState(org.pan || '')
  const [ownerName, setOwnerName] = useState(org.owner?.name || '')
  const [ownerEmail, setOwnerEmail] = useState(org.owner?.email || '')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Track what's actually changed so we don't fire unnecessary writes
  // (and don't accidentally clear PAN/GSTIN by sending empty strings the
  // user never touched).
  const orgChanged =
    orgName.trim() !== org.name ||
    centralGstin.trim().toUpperCase() !== (org.centralGstin || '') ||
    pan.trim().toUpperCase() !== (org.pan || '')
  const ownerChanged =
    org.owner &&
    (ownerName.trim() !== (org.owner.name || '') ||
      ownerEmail.trim().toLowerCase() !== (org.owner.email || '').toLowerCase())
  const passwordChanged = newPassword.length > 0
  const dirty = orgChanged || ownerChanged || passwordChanged

  const submit = async () => {
    if (!orgName.trim()) return toast.error('Organisation name is required')
    if (org.owner && !ownerName.trim()) return toast.error('Owner name is required')
    if (org.owner && !ownerEmail.trim()) return toast.error('Owner email is required')
    if (passwordChanged && newPassword.length < 8) {
      return toast.error('Password must be at least 8 characters')
    }
    if (!dirty) {
      onClose()
      return
    }

    setSubmitting(true)
    try {
      if (orgChanged) {
        await api.put(`/platform/organizations/${org.id}`, {
          name: orgName.trim(),
          centralGstin: centralGstin.trim().toUpperCase(),
          pan: pan.trim().toUpperCase(),
        })
      }
      if (ownerChanged && org.owner) {
        await api.put(`/platform/users/${org.owner.id}`, {
          name: ownerName.trim(),
          email: ownerEmail.trim().toLowerCase(),
        })
      }
      if (passwordChanged && org.owner) {
        await api.put(`/platform/users/${org.owner.id}/password`, {
          password: newPassword,
        })
      }
      toast.success(`${orgName.trim()} updated`)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not save changes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit tenant · {org.name}</DialogTitle>
          <DialogDescription>
            Edit the organisation&rsquo;s identity and the owner-admin&rsquo;s details.
            For plan / billing, use <b>Subscription</b>. For locking, use <b>Block</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Organisation block */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Organisation
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Central GSTIN</Label>
                  <Input
                    value={centralGstin}
                    onChange={(e) => setCentralGstin(e.target.value.toUpperCase())}
                    maxLength={15}
                    placeholder="07AAAAA0000A1Z5"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PAN</Label>
                  <Input
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="AAAAA0000A"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Owner-admin block */}
          {org.owner ? (
            <div className="border-t pt-4">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Owner-admin
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Full name *</Label>
                    <Input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      New password{' '}
                      <span className="text-muted-foreground font-normal">
                        (leave blank to keep current)
                      </span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewPassword(generateStrongPassword())
                        setShowPassword(true)
                      }}
                      className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1"
                    >
                      <Wand2 className="w-3 h-3" /> Generate strong
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Set a new password (optional)"
                      className="font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic border-t pt-3">
              This tenant has no linked owner-admin. Create one via the New Tenant flow.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !dirty}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Pencil className="w-4 h-4 mr-1" />
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
