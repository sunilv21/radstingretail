'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Receipt,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Hourglass,
  Send,
  CreditCard,
  Building2,
  Plus,
  Trash2,
  IndianRupee,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/admin-api'
import type {
  PlatformPaymentRow,
  PlatformPaymentListResponse,
  PlatformPaymentStatus,
  PlatformPaymentType,
  OrgRow,
  SubscriptionPlanRow,
} from '@/lib/admin-types'

const STATUSES: PlatformPaymentStatus[] = [
  'pending',
  'awaiting_confirmation',
  'completed',
  'rejected',
  'cancelled',
]

const STATUS_TONE: Record<PlatformPaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  awaiting_confirmation: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const STATUS_LABEL: Record<PlatformPaymentStatus, string> = {
  pending: 'Pending',
  awaiting_confirmation: 'Awaiting Confirm',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const TYPE_LABEL: Record<PlatformPaymentType, string> = {
  subscription: 'Subscription',
  user_addon: 'Extra users',
  manual: 'Manual',
  other: 'Other',
}

const inr = (n: number, currency = 'INR') =>
  currency === 'INR'
    ? '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : `${currency} ${Number(n || 0).toLocaleString()}`

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PlatformPaymentRow[]>([])
  const [summary, setSummary] = useState({
    pending: 0,
    awaiting_confirmation: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    totalCollected: 0,
  })
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | PlatformPaymentStatus>('all')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<PlatformPaymentRow | null>(null)
  const [vendorNote, setVendorNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const path =
        statusFilter === 'all'
          ? '/platform/payments'
          : `/platform/payments?status=${statusFilter}`
      const res = await api.get<PlatformPaymentListResponse>(path)
      setPayments(res.payments)
      setSummary(res.summary)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const confirm = async () => {
    if (!active) return
    setSubmitting(true)
    try {
      await api.put(`/platform/payments/${active.id}/confirm`, {
        vendorNote: vendorNote.trim() || undefined,
      })
      toast.success('Payment confirmed — entitlement applied to the tenant.')
      setActive(null)
      setVendorNote('')
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reject = async () => {
    if (!active) return
    if (!window.confirm(`Reject payment ${active.reference}?`)) return
    setSubmitting(true)
    try {
      await api.put(`/platform/payments/${active.id}/reject`, {
        vendorNote: vendorNote.trim() || undefined,
      })
      toast.success('Rejected')
      setActive(null)
      setVendorNote('')
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (p: PlatformPaymentRow) => {
    if (!window.confirm(`Delete payment ${p.reference}? Cannot delete completed rows.`)) return
    try {
      await api.del(`/platform/payments/${p.id}`)
      toast.success('Deleted')
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.reference.toLowerCase().includes(q) ||
        p.organizationName.toLowerCase().includes(q) ||
        (p.planName || '').toLowerCase().includes(q) ||
        (p.gatewayReference || '').toLowerCase().includes(q),
    )
  }, [payments, search])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-rose-600" />
            Payments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Subscription renewals, plan switches and extra-user add-ons. Review
            tenant-submitted payments here and confirm to activate the entitlement.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => setRecordOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Record payment
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard label="Total collected" value={inr(summary.totalCollected)} icon={<IndianRupee className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Awaiting confirm" value={summary.awaiting_confirmation} icon={<Clock className="w-4 h-4 text-blue-500" />} />
        <StatCard label="Pending" value={summary.pending} icon={<Hourglass className="w-4 h-4 text-amber-500" />} />
        <StatCard label="Completed" value={summary.completed} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Rejected" value={summary.rejected} icon={<AlertCircle className="w-4 h-4 text-rose-500" />} />
        <StatCard label="Cancelled" value={summary.cancelled} icon={<XCircle className="w-4 h-4 text-slate-400" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 flex-wrap text-[11px]">
        <FilterPill
          label="All"
          count={payments.length}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={STATUS_LABEL[s]}
            count={summary[s]}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            tone={s}
          />
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference / org / gateway ref"
          className="ml-auto h-7 w-72 text-[12px]"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No payments in this view.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-3 py-2">Reference</th>
                  <th className="text-left px-3 py-2">Tenant</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Created</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setActive(p)}>
                    <td className="px-3 py-2 font-mono text-[11px]">{p.reference}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate">{p.organizationName}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {p.type === 'subscription' ? <CreditCard className="w-3 h-3 mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                        {TYPE_LABEL[p.type]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[12px]">
                      {p.type === 'subscription'
                        ? p.planName || p.planCode
                        : p.type === 'user_addon'
                          ? `${p.addonQuantity} × ${p.addonRole}`
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {inr(p.amount, p.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${STATUS_TONE[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{fmt(p.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.status !== 'completed' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            remove(p)
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Detail / confirm dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Payment <span className="font-mono text-base">{active?.reference}</span>
            </DialogTitle>
            <DialogDescription>
              Review tenant&rsquo;s submission. Confirming applies the entitlement
              (extends subscription or grants extra user slots).
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-2.5 text-sm">
              <KV label="Tenant" value={active.organizationName} />
              <KV label="Type" value={TYPE_LABEL[active.type]} />
              {active.type === 'subscription' && (
                <>
                  <KV label="Plan" value={`${active.planName} (${active.planCode})`} />
                  <KV label="Cycle" value={`${active.cycleMonths} month${active.cycleMonths === 1 ? '' : 's'}`} />
                </>
              )}
              {active.type === 'user_addon' && (
                <KV label="Add-on" value={`${active.addonQuantity} × ${active.addonRole}`} />
              )}
              <KV label="Amount" value={inr(active.amount, active.currency)} highlight />
              <KV label="Status" value={STATUS_LABEL[active.status]} />
              <KV label="Initiated by" value={`${active.initiatedByName}${active.initiatedByEmail ? ` · ${active.initiatedByEmail}` : ''}`} />
              {active.gatewayReference && (
                <KV label="Gateway ref" value={<span className="font-mono">{active.gatewayReference}</span>} />
              )}
              {active.tenantNote && (
                <div className="rounded-md border bg-muted/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    Tenant note
                  </div>
                  <p className="text-[12px]">{active.tenantNote}</p>
                </div>
              )}
              <KV label="Paid at" value={fmt(active.paidAt)} />
              <KV label="Created" value={fmt(active.createdAt)} />
              {active.status === 'completed' ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-2 text-[12px] text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmed by {active.confirmedByName} on {fmt(active.confirmedAt)}
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Vendor note (optional)</Label>
                  <textarea
                    value={vendorNote}
                    onChange={(e) => setVendorNote(e.target.value)}
                    rows={2}
                    placeholder="Internal note — visible to tenant on their billing page."
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y mt-1"
                  />
                </div>
              )}
            </div>
          )}
          {active && active.status !== 'completed' && (
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={reject}
                disabled={submitting}
                className="text-rose-600 hover:text-rose-700"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={confirm}
                disabled={submitting}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {submitting ? 'Confirming…' : 'Confirm payment'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Record manual payment dialog */}
      {recordOpen && (
        <RecordPaymentDialog
          onClose={() => setRecordOpen(false)}
          onSaved={() => {
            setRecordOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-base font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tone?: PlatformPaymentStatus
}) {
  const inactive = 'bg-card hover:bg-muted text-muted-foreground border-border'
  const activeClass =
    tone && active
      ? STATUS_TONE[tone] + ' border-transparent'
      : 'bg-indigo-600 text-white border-indigo-600'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${active ? activeClass : inactive}`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-muted-foreground/15'}`}>
        {count}
      </span>
    </button>
  )
}

function KV({
  label,
  value,
  highlight,
}: {
  label: string
  value: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[13px]">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wider">{label}</span>
      <span className={highlight ? 'font-bold text-base' : 'font-medium'}>{value}</span>
    </div>
  )
}

// =====================================================================
// Manual payment recording — vendor logs an offline payment (bank
// transfer, phone, etc.) and the system applies the entitlement.
// =====================================================================

const ROLES = ['admin', 'manager', 'cashier', 'accountant', 'ca'] as const

function RecordPaymentDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([])
  const [type, setType] = useState<PlatformPaymentType>('subscription')
  const [orgId, setOrgId] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [addonRole, setAddonRole] = useState<typeof ROLES[number]>('cashier')
  const [addonQuantity, setAddonQuantity] = useState(1)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [gatewayReference, setGatewayReference] = useState('')
  const [vendorNote, setVendorNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<OrgRow[]>('/platform/organizations'),
      api.get<SubscriptionPlanRow[]>('/platform/plans'),
    ])
      .then(([o, p]) => {
        setOrgs(o)
        setPlans(p)
      })
      .catch(() => {})
  }, [])

  // Auto-fill amount when the user picks a plan or changes the addon qty.
  useEffect(() => {
    if (type === 'subscription' && planCode) {
      const plan = plans.find((p) => p.code === planCode)
      if (plan) setAmount(String(plan.price))
    }
  }, [type, planCode, plans])

  const submit = async () => {
    if (!orgId) {
      toast.error('Pick a tenant')
      return
    }
    if (type === 'subscription' && !planCode) {
      toast.error('Pick a plan')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        organizationId: orgId,
        type,
        amount: Math.max(0, Number(amount) || 0),
        currency,
        gatewayReference: gatewayReference.trim(),
        vendorNote: vendorNote.trim(),
        status: 'completed',
      }
      if (type === 'subscription') body.planCode = planCode
      if (type === 'user_addon') {
        body.addonRole = addonRole
        body.addonQuantity = addonQuantity
      }
      await api.post('/platform/payments', body)
      toast.success('Payment recorded · entitlement applied')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record offline payment</DialogTitle>
          <DialogDescription>
            Log a payment that came in via bank transfer / phone / etc. Status is set to
            <em> completed</em> immediately and the entitlement (subscription extension or
            extra user slots) is applied to the tenant.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tenant *</Label>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
            >
              <option value="">— Pick a tenant —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PlatformPaymentType)}
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                <option value="subscription">Subscription / renewal</option>
                <option value="user_addon">Extra user slots</option>
                <option value="manual">Manual / other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                className="h-9 mt-1"
              />
            </div>
          </div>
          {type === 'subscription' && (
            <div>
              <Label className="text-xs">Plan *</Label>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                <option value="">— Pick a plan —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name} · {inr(p.price, p.currency)} {p.billingCycle}
                  </option>
                ))}
              </select>
            </div>
          )}
          {type === 'user_addon' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <select
                  value={addonRole}
                  onChange={(e) => setAddonRole(e.target.value as typeof ROLES[number])}
                  className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={addonQuantity}
                  onChange={(e) => setAddonQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 mt-1"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount *</Label>
              <Input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Gateway / bank reference</Label>
              <Input
                value={gatewayReference}
                onChange={(e) => setGatewayReference(e.target.value)}
                placeholder="e.g. UTR12345 / pay_NXa1Bcd"
                className="h-9 mt-1 font-mono text-[12px]"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Vendor note</Label>
            <textarea
              value={vendorNote}
              onChange={(e) => setVendorNote(e.target.value)}
              rows={2}
              placeholder="Optional internal note."
              className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={submit}
            disabled={submitting}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {submitting ? 'Recording…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
